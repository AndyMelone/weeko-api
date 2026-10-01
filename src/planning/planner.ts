import { randomUUID } from 'node:crypto';
import type {
  BaseSlot,
  Due,
  SchoolClass,
  Service,
  Session,
} from '../generated/prisma/client';
import { SessionKind, SessionStatus, Who } from '../generated/prisma/enums';
import {
  dayNamesLower,
  dayShort,
  fmt,
  parseTime,
  plural,
  range,
  weekRange,
} from './formats';

// Port de la logique de l'app mobile (../weeko/lib/logic/app_state.dart).
// Le planner travaille sur un état en mémoire ; PlanningRepository charge cet
// état depuis la base et persiste les différences.

/** Heure limite : rien après 21h30. */
export const DAY_END = 1290;

/** Heure de sortie du travail par défaut, lun.–ven. */
export const DEFAULT_OFF = ['15:00', '15:00', '18:00', '15:00', '16:00'];

/** « après 12h », « avant 12h » ou « 14h–16h ». */
export function blockLabel(b: { start: number; end: number }): string {
  if (b.start <= 0) return `avant ${fmt(b.end)}`;
  if (b.end >= 1440) return `après ${fmt(b.start)}`;
  return range(b.start, b.end);
}

export type WeekChange = 'normal' | 'une' | 'absent';

/** Créneau Succès Group choisi dans Préparer (jour + heures de début et fin). */
export interface ClassTime {
  day: number;
  start: number;
  end: number;
}

/** Plage indisponible un jour donné (minutes depuis minuit). */
export interface TimeBlock {
  day: number;
  start: number;
  end: number;
}

export type ServiceData = Omit<Service, 'createdAt' | 'updatedAt'> & {
  fixed: { day: number; start: number }[];
  unavailable: TimeBlock[];
};
export type ClassData = Omit<SchoolClass, 'deletedAt'>;
export type SessionData = Omit<Session, 'cancelledAt'>;
export type DueData = Omit<Due, 'createdAt'>;
export type BaseSlotData = BaseSlot;

export interface PrepData {
  off: string[];
  /** Classe → nombre de séances placées automatiquement (sans [times]). */
  counts: Record<string, number>;
  /** Classe → créneaux choisis. Présent : remplace [counts] pour cette classe. */
  times: Record<string, ClassTime[]>;
  changes: Record<string, WeekChange>;
  include: Record<string, boolean>;
}

export interface PlanState {
  services: Map<string, ServiceData>;
  classes: Map<string, ClassData>;
  /** Ids des élèves, dans l'ordre d'affichage. */
  students: string[];
  sessions: SessionData[];
  dues: DueData[];
  preps: Map<number, PrepData>;
  generated: Set<number>;
  baseSlots: BaseSlotData[];
  /** Compter les trajets (réglage global). Désactivé : séances bout à bout. */
  travel: boolean;
  /** Indisponibilités du répétiteur. */
  tutorUnavailable: TimeBlock[];
  /** Semaine en cours : point de départ des propositions de rattrapage. */
  currentWeek: number;
  /**
   * Séances annulées pendant l'opération : retirées de [sessions], puis
   * archivées en base (cancelledAt), jamais effacées.
   */
  cancelled: Set<string>;
}

export interface Slot {
  week: number;
  day: number;
  start: number;
  end: number;
}

/** Élément de l'écran Rattrapages : séance due ou séance Succès Group non placée. */
export interface RattItem {
  key: string;
  svc: string;
  cls: string | null;
  due: DueData | null;
  week: number;
  placedSession: SessionData | null;
  title: string;
  detail: string;
  /** Libellé du créneau casé, null si pas encore casé. */
  placed: string | null;
}

/** Choix d'un créneau : une proposition (index) ou un jour manuel. */
export type SlotChoice =
  | { proposal: number }
  | { day: number }
  /** Créneau précis (ex. donné par le président de Succès Group). */
  | { slot: Slot };

/** Annulation d'une séance prévue (absence prévenue). */
export interface CancelDraft {
  redo: boolean;
  who?: Who | null;
  motif?: string;
}

export interface PointerDraft {
  missed: boolean;
  who?: Who | null;
  motif?: string;
  redo?: boolean;
}

const newId = () => randomUUID();

export class Planner {
  constructor(
    readonly state: PlanState,
    private readonly makeId: (prefix: string) => string = newId,
  ) {}
  svc(id: string): ServiceData {
    const s = this.state.services.get(id);
    if (!s) throw new Error(`Service inconnu : ${id}`);
    return s;
  }

  isEleve(svcId: string) {
    return this.svc(svcId).kind === 'eleve';
  }

  week(w: number, ss?: SessionData[]) {
    return (ss ?? this.state.sessions).filter((s) => s.week === w);
  }

  defaultPrep(): PrepData {
    const counts: Record<string, number> = {};
    const times: Record<string, ClassTime[]> = {};
    for (const c of this.state.classes.values()) {
      counts[c.id] = c.defaultCount;
      times[c.id] = [];
    }
    return { off: [...DEFAULT_OFF], counts, times, changes: {}, include: {} };
  }

  prepOf(w: number): PrepData {
    return this.state.preps.get(w) ?? this.defaultPrep();
  }

  private prepFor(w: number): PrepData {
    let p = this.state.preps.get(w);
    if (!p) this.state.preps.set(w, (p = this.defaultPrep()));
    return p;
  }

  /** Heure de sortie du travail (minutes), null le week-end ou si vide. */
  off(day: number, w: number): number | null {
    return day < 5 ? parseTime(this.prepOf(w).off[day]) : null;
  }

  sessionById(id: string | null | undefined) {
    return id == null
      ? undefined
      : this.state.sessions.find((s) => s.id === id);
  }

  className(id: string) {
    return this.state.classes.get(id)?.name ?? id;
  }

  titleOf(s: { cls: string | null; svc: string }) {
    return s.cls != null ? this.className(s.cls) : this.svc(s.svc).name;
  }

  whoLabel(u: DueData) {
    return u.who === Who.moi
      ? 'moi absent'
      : this.isEleve(u.svc)
        ? 'élève absent'
        : 'classe absente';
  }

  /** Durée de trajet entre deux séances consécutives (0 si trajets non comptés). */
  travel(a: { svc: string }, b: { svc: string }) {
    if (!this.state.travel) return 0;
    if (this.isEleve(a.svc) && this.isEleve(b.svc)) return 10;
    if (a.svc === b.svc && !this.isEleve(a.svc)) return 0;
    return 30;
  }

  get fromWork() {
    return this.state.travel ? 30 : 0;
  }
  /** Indisponibilités (répétiteur + [svcId]) le jour [d]. */
  blocksOn(svcId: string, d: number): TimeBlock[] {
    return [
      ...this.state.tutorUnavailable,
      ...this.svc(svcId).unavailable,
    ].filter((b) => b.day === d);
  }

  private blocked(svcId: string, d: number, st: number, en: number) {
    return this.blocksOn(svcId, d).some((b) => st < b.end && en > b.start);
  }

  /** Premier créneau possible pour [svcId] le jour [d] de la semaine [w]. */
  slotOn(svcId: string, d: number, ss: SessionData[], w: number): Slot | null {
    const o = this.off(d, w);
    const day = ss
      .filter((s) => s.day === d && s.status !== SessionStatus.manquee)
      .sort((a, b) => a.start - b.start);
    const S = this.svc(svcId);
    if (S.kind === 'eleve') {
      if (S.noWeekend && d >= 5) return null;
      if (S.exDays.includes(d)) return null;
      // Jamais le même élève deux jours de suite.
      if (
        ss.some(
          (s) =>
            s.svc === svcId &&
            s.status !== SessionStatus.manquee &&
            Math.abs(s.day - d) <= 1,
        )
      ) {
        return null;
      }
      const earliest = Math.max(
        o != null ? o + this.fromWork : 480,
        S.notBefore ?? 0,
      );
      const latest = Math.min(DAY_END, S.notAfter ?? DAY_END);
      const cands = [
        earliest,
        ...day.map((s) => s.end + this.travel(s, { svc: svcId })),
        ...this.blocksOn(svcId, d).map((b) => b.end),
      ].sort((a, b) => a - b);
      for (const c of cands) {
        const st = Math.max(c, earliest);
        const en = st + 120;
        if (en > latest || this.blocked(svcId, d, st, en)) continue;
        // Un élève peut passer avant Succès Group, jamais après.
        if (day.some((s) => !this.isEleve(s.svc) && s.start < st)) continue;
        const fits = day.every((s) => {
          const t = this.travel(s, { svc: svcId });
          return en + t <= s.start || st >= s.end + t;
        });
        if (fits) return { week: w, day: d, start: st, end: en };
      }
      return null;
    }
    // Succès Group : 18h–20h30 en semaine ; 8h–12h ou 14h–18h le week-end.
    const wins: [number, number][] =
      d < 5
        ? [[1080, 1230]]
        : [
            [480, 720],
            [840, 1080],
          ];
    for (const [st, en] of wins) {
      if (o != null && o + this.fromWork > st) continue;
      if (this.blocked(svcId, d, st, en)) continue;
      const fits = day.every((s) => {
        const t = this.state.travel && s.svc !== svcId ? 30 : 0;
        return s.end + t <= st || (!this.isEleve(s.svc) && en + t <= s.start);
      });
      if (fits) return { week: w, day: d, start: st, end: en };
    }
    return null;
  }

  slots(
    svcId: string,
    opts: { onlyDay?: number; w?: number; ss?: SessionData[] } = {},
  ): Slot[] {
    const w = opts.w ?? 0;
    const ss = opts.ss ?? this.week(w);
    const out: Slot[] = [];
    for (let d = 0; d < 7; d++) {
      if (opts.onlyDay != null && d !== opts.onlyDay) continue;
      const sl = this.slotOn(svcId, d, ss, w);
      if (sl) out.push(sl);
    }
    return out;
  }

  /** Propositions pour la semaine suivante quand elle n'est pas encore générée. */
  private nextWeekFallback(svcId: string, w0: number): Slot[] {
    const w = w0 + 1;
    if (!this.isEleve(svcId)) {
      return [
        { week: w, day: 0, start: 1080, end: 1230 },
        { week: w, day: 1, start: 1080, end: 1230 },
        { week: w, day: 5, start: 480, end: 720 },
      ].filter((s) => !this.blocked(svcId, s.day, s.start, s.end));
    }
    const out: Slot[] = [];
    const sunday = this.week(w0).some((s) => s.svc === svcId && s.day === 6);
    for (let d = 0; d < 5 && out.length < 2; d++) {
      if (d === 0 && sunday) continue;
      const st = (this.off(d, w) ?? 900) + this.fromWork;
      if (this.svc(svcId).exDays.includes(d)) continue;
      if (this.blocked(svcId, d, st, st + 120)) continue;
      if (st + 120 <= DAY_END)
        out.push({ week: w, day: d, start: st, end: st + 120 });
    }
    return out;
  }

  proposals(it: RattItem): Slot[] {
    const w0 = it.week;
    const a = this.slots(it.svc, { w: w0 });
    const b = this.state.generated.has(w0 + 1)
      ? this.slots(it.svc, { w: w0 + 1 })
      : this.nextWeekFallback(it.svc, w0);
    return [...a, ...b].slice(0, 3);
  }

  /** Raison pour laquelle aucun créneau n'est possible le jour [d]. */
  reason(it: RattItem, d: number): string {
    const S = this.svc(it.svc);
    if (S.kind === 'eleve') {
      if (S.noWeekend && d >= 5)
        return `${S.first} ne prend pas de cours le week-end.`;
      if (S.exDays.includes(d))
        return `${S.first} ne prend jamais cours le ${dayNamesLower[d]}.`;
      if (
        this.week(it.week).some(
          (s) =>
            s.svc === it.svc &&
            s.status !== SessionStatus.manquee &&
            Math.abs(s.day - d) <= 1,
        )
      ) {
        return `${S.first} a déjà cours ce jour-là, la veille ou le lendemain.`;
      }
      const blocks = this.blocksOn(it.svc, d);
      if (blocks.length) {
        return `Pas de créneau de 2 h libre ce jour-là (indisponible ${blocks.map(blockLabel).join(', ')}).`;
      }
      return this.state.travel
        ? 'Pas de créneau de 2 h libre ce jour-là (trajets, fin à 21h30).'
        : 'Pas de créneau de 2 h libre ce jour-là (fin à 21h30).';
    }
    return 'Pas de créneau Succès Group libre ce jour-là.';
  }

  items(): RattItem[] {
    const out: RattItem[] = [];
    for (const u of this.state.dues.filter((u) => !u.done)) {
      const ps = this.sessionById(u.placedSession) ?? null;
      out.push({
        key: u.id,
        svc: u.svc,
        cls: u.cls,
        due: u,
        week: this.state.currentWeek,
        placedSession: ps,
        title:
          u.cls != null
            ? `${this.className(u.cls)} · ${this.svc(u.svc).name}`
            : this.svc(u.svc).name,
        detail: `Manquée ${u.from} · ${this.whoLabel(u)}${u.motif ? ` · ${u.motif}` : ''}`,
        placed:
          ps == null
            ? null
            : `${dayShort(ps.week, ps.day)} · ${range(ps.start, ps.end)}`,
      });
    }
    // Non casés en premier (tri stable).
    return [
      ...out.filter((i) => i.placed == null),
      ...out.filter((i) => i.placed != null),
    ];
  }

  todoCount() {
    return this.items().filter((i) => i.placed == null).length;
  }

  item(key: string) {
    return this.items().find((i) => i.key === key);
  }

  /** Résout un choix en créneau, null si invalide. */
  resolveChoice(it: RattItem, choice: SlotChoice): Slot | null {
    if ('proposal' in choice)
      return this.proposals(it)[choice.proposal] ?? null;
    if ('slot' in choice) return choice.slot;
    return this.slots(it.svc, { onlyDay: choice.day, w: it.week })[0] ?? null;
  }

  /** Case le créneau choisi. Retourne le texte du toast, null si le créneau est invalide. */
  place(
    it: RattItem,
    choice: SlotChoice,
  ): { message: string; session: SessionData } | null {
    const p = this.resolveChoice(it, choice);
    if (!p) return null;
    const session: SessionData = {
      id: this.makeId('r'),
      week: p.week,
      day: p.day,
      start: p.start,
      end: p.end,
      svc: it.svc,
      cls: it.cls,
      status: SessionStatus.prevue,
      kind: it.due ? SessionKind.rattrapage : SessionKind.normal,
      dueId: it.due?.id ?? null,
      who: null,
      motif: '',
      noRedo: false,
      fixed: false,
      base: false,
    };
    this.state.sessions = [...this.state.sessions, session];
    if (it.due) {
      this.state.dues = this.state.dues.map((u) =>
        u.id === it.due!.id ? { ...u, placedSession: session.id } : u,
      );
    }
    this.prepFor(p.week);
    return {
      message: `Placé : ${dayShort(p.week, p.day)} · ${range(p.start, p.end)} · ajouté au planning du jour`,
      session,
    };
  }
  updatePrep(w: number, patch: Partial<PrepData>) {
    const p = this.prepFor(w);
    if (patch.off) p.off = [...patch.off];
    if (patch.counts) Object.assign(p.counts, patch.counts);
    if (patch.times) {
      for (const [c, ts] of Object.entries(patch.times))
        p.times[c] = ts.map((t) => ({
          day: t.day,
          start: t.start,
          end: t.end,
        }));
    }
    if (patch.changes) Object.assign(p.changes, patch.changes);
    if (patch.include) Object.assign(p.include, patch.include);
    return p;
  }

  /** Génère le planning de la semaine [w]. Retourne le texte du toast. */
  generate(w: number): string {
    const prep = this.prepOf(w);
    const cur = this.week(w);
    const prev = new Map(cur.map((s) => [s.id, s]));
    const extra = cur.filter((s) => !s.base);
    // Rattrapages du planning de base : semaine 0 seulement, et seulement s'ils
    // existent encore (un rattrapage annulé ne revient pas).
    const base =
      w === 0
        ? this.state.baseSlots.filter(
            (s) => s.kind !== SessionKind.rattrapage || prev.has(s.id),
          )
        : this.state.baseSlots.filter((s) => s.kind !== SessionKind.rattrapage);

    const isRatt = (s: SessionData) => s.kind === SessionKind.rattrapage;
    const isNormalOf = (s: SessionData, k: string) => s.svc === k && !isRatt(s);
    const blank = (
      s: Omit<
        SessionData,
        | 'status'
        | 'kind'
        | 'dueId'
        | 'who'
        | 'motif'
        | 'noRedo'
        | 'fixed'
        | 'base'
      > &
        Partial<SessionData>,
    ): SessionData => ({
      status: SessionStatus.prevue,
      kind: SessionKind.normal,
      dueId: null,
      who: null,
      motif: '',
      noRedo: false,
      fixed: false,
      base: false,
      ...s,
    });

    let ss: SessionData[] = [
      ...base.map((d) => {
        const id = w === 0 ? d.id : `${d.id}-w${w}`;
        const p = prev.get(id);
        return blank({
          id,
          week: w,
          day: d.day,
          start: d.start,
          end: d.end,
          svc: d.svc,
          cls: d.cls,
          kind: d.kind,
          dueId: d.dueId,
          fixed: d.fixed,
          base: true,
          status: p?.status ?? SessionStatus.prevue,
          who: p?.who ?? null,
          motif: p?.motif ?? '',
          noRedo: p?.noRedo ?? false,
        });
      }),
      ...extra,
    ];
    ss = ss.filter(
      (s) => !(isRatt(s) && s.dueId != null && prep.include[s.dueId] === false),
    );

    // Succès Group aux créneaux choisis : placés avant les élèves, qui s'organisent autour.
    for (const c of this.state.classes.values()) {
      const times = prep.times[c.id];
      if (!times) continue;
      ss = ss.filter((s) => s.cls !== c.id || isRatt(s) || s.base);
      times.forEach((t, i) => {
        const id = `sg${c.id}-${i}-w${w}`;
        const p = prev.get(id);
        const same =
          p && p.day === t.day && p.start === t.start && p.end === t.end;
        ss.push(
          blank({
            id,
            week: w,
            day: t.day,
            start: t.start,
            end: t.end,
            svc: c.siteId,
            cls: c.id,
            fixed: true,
            status: same ? p.status : SessionStatus.prevue,
            who: same ? p.who : null,
            motif: same ? p.motif : '',
            noRedo: same ? p.noRedo : false,
          }),
        );
      });
    }

    for (const k of this.state.students) {
      const S = this.svc(k);
      const change = prep.changes[k] ?? 'normal';
      const target = change === 'absent' ? 0 : change === 'une' ? 1 : S.perWeek;
      let n = 0;
      ss = ss.filter((s) => !isNormalOf(s, k) || ++n <= target);
      // Jours fixes placés en premier.
      for (const fx of S.fixed) {
        const have = ss.filter((s) => isNormalOf(s, k));
        if (have.length >= target || have.some((s) => s.day === fx.day))
          continue;
        ss.push(
          blank({
            id: `f${k}${fx.day}-w${w}`,
            week: w,
            day: fx.day,
            start: fx.start,
            end: fx.start + 120,
            svc: k,
            cls: null,
            fixed: true,
          }),
        );
      }
      let need = target - ss.filter((s) => isNormalOf(s, k)).length;
      while (need-- > 0) {
        const sl = this.slots(k, { w, ss })[0];
        if (!sl) break;
        ss.push(
          blank({
            id: this.makeId(`g${k}`),
            week: w,
            day: sl.day,
            start: sl.start,
            end: sl.end,
            svc: k,
            cls: null,
          }),
        );
      }
    }

    const others = this.state.sessions.filter((s) => s.week !== w);
    let nd = this.state.dues.map((u) =>
      u.placedSession != null &&
      !others.some((s) => s.id === u.placedSession) &&
      !ss.some((s) => s.id === u.placedSession)
        ? { ...u, placedSession: null }
        : u,
    );
    nd = nd.map((u) => {
      if (u.done || u.placedSession != null || prep.include[u.id] === false)
        return u;
      // Succès Group : la date du rattrapage est donnée par le président.
      if (!this.isEleve(u.svc)) return u;
      const sl = this.slots(u.svc, { w, ss })[0];
      if (!sl) return u;
      const id = this.makeId(`r${u.id}`);
      ss.push(
        blank({
          id,
          week: w,
          day: sl.day,
          start: sl.start,
          end: sl.end,
          svc: u.svc,
          cls: u.cls,
          kind: SessionKind.rattrapage,
          dueId: u.id,
        }),
      );
      return { ...u, placedSession: id };
    });

    this.state.sessions = [...others, ...ss];
    this.state.dues = nd;
    this.state.preps.set(w, prep);
    this.state.generated.add(w);
    return `Planning du ${weekRange(w)} : ${ss.length} séances`;
  }

  /** Déplace ou change l'heure d'une séance prévue. Null si elle est déjà pointée. */
  moveSession(id: string, to: Slot): string | null {
    const s = this.sessionById(id);
    if (!s || s.status !== SessionStatus.prevue) return null;
    this.state.sessions = this.state.sessions.map((x) =>
      x.id === id
        ? { ...x, week: to.week, day: to.day, start: to.start, end: to.end }
        : x,
    );
    this.prepFor(to.week);
    return `Séance déplacée : ${dayShort(to.week, to.day)} · ${range(to.start, to.end)}`;
  }

  /**
   * Annule une séance prévue (absence prévenue). Elle sort du planning
   * (archivée) ; avec [redo], une séance à rattraper est créée. Un rattrapage
   * annulé repasse simplement « à caser ». Null si la séance est déjà pointée.
   */
  cancelSession(id: string, d: CancelDraft): string | null {
    const s = this.sessionById(id);
    if (!s || s.status !== SessionStatus.prevue) return null;
    if (s.kind === SessionKind.rattrapage && s.dueId) {
      const due = this.state.dues.find((u) => u.id === s.dueId);
      if (due?.placedSession === s.id) return this.cancelRattrapage(due.id);
    }
    this.state.sessions = this.state.sessions.filter((x) => x.id !== id);
    this.state.cancelled.add(id);
    if (!d.redo) return 'Séance annulée · pas de rattrapage';
    this.state.dues = [
      ...this.state.dues,
      {
        id: this.makeId('d'),
        svc: s.svc,
        cls: s.cls,
        from: dayShort(s.week, s.day),
        who: d.who ?? Who.eleve,
        motif: d.motif ?? '',
        placedSession: null,
        done: false,
        sourceId: s.id,
      },
    ];
    return 'Séance annulée · 1 séance à rattraper créée';
  }

  /**
   * Annule le rattrapage casé pour la séance due [dueId] : la séance est
   * retirée du planning et la séance due repasse « à caser ».
   * Retourne null si rien n'est casé ou si la séance est déjà pointée.
   */
  cancelRattrapage(dueId: string): string | null {
    const u = this.state.dues.find((x) => x.id === dueId);
    if (!u || u.done || u.placedSession == null) return null;
    const s = this.sessionById(u.placedSession);
    if (s && s.status !== SessionStatus.prevue) return null;
    if (s) {
      this.state.sessions = this.state.sessions.filter((x) => x.id !== s.id);
      this.state.cancelled.add(s.id);
    }
    this.state.dues = this.state.dues.map((x) =>
      x.id === dueId ? { ...x, placedSession: null } : x,
    );
    return 'Rattrapage annulé · séance à replacer';
  }
  /** Enregistre le pointage. Retourne le texte du toast. */
  savePointer(sessionId: string, d: PointerDraft): string {
    const s = this.sessionById(sessionId);
    if (!s) throw new Error(`Séance inconnue : ${sessionId}`);
    const missed = d.missed;
    const redo = d.redo ?? true;
    const isRatt = s.kind === SessionKind.rattrapage;
    this.state.sessions = this.state.sessions.map((x) =>
      x.id !== s.id
        ? x
        : {
            ...x,
            status: missed
              ? SessionStatus.manquee
              : isRatt
                ? SessionStatus.rattrapee
                : SessionStatus.faite,
            who: missed ? (d.who ?? null) : null,
            motif: missed ? (d.motif ?? '') : '',
            noRedo: missed && !redo,
          },
    );
    let nd = this.state.dues.filter((u) => u.sourceId !== s.id);
    if (isRatt && s.dueId != null) {
      nd = nd.map((u) =>
        u.id === s.dueId
          ? {
              ...u,
              done: !missed || !redo,
              placedSession: missed ? null : u.placedSession,
            }
          : u,
      );
    } else if (missed && redo) {
      nd.push({
        id: this.makeId('d'),
        svc: s.svc,
        cls: s.cls,
        from: dayShort(s.week, s.day),
        who: d.who!,
        motif: d.motif ?? '',
        placedSession: null,
        done: false,
        sourceId: s.id,
      });
    }
    this.state.dues = nd;
    if (!missed)
      return isRatt
        ? 'Rattrapage fait · séance rattrapée'
        : 'Séance faite enregistrée';
    if (!redo) return 'Séance manquée · pas de rattrapage';
    return isRatt
      ? 'Rattrapage manqué : séance à replacer'
      : 'Séance manquée · 1 séance à rattraper créée';
  }
  /** Règle affichée sur la fiche élève. */
  ruleOf(S: ServiceData): string {
    const ex = S.exDays.filter((d) => !(S.noWeekend && d >= 5));
    return (
      `${plural(S.perWeek, 'séance')} de 2 h par semaine` +
      (S.noWeekend ? ' · jamais le week-end' : '') +
      (ex.length
        ? ` · jamais le ${ex.map((d) => dayNamesLower[d]).join(', ')}`
        : '') +
      (S.notBefore != null ? ` · pas avant ${fmt(S.notBefore)}` : '') +
      (S.notAfter != null ? ` · fini avant ${fmt(S.notAfter)}` : '') +
      (S.fixed.length
        ? ` · fixe le ${S.fixed.map((f) => `${dayNamesLower[f.day]} ${fmt(f.start)}`).join(', ')}`
        : '') +
      (S.unavailable.length
        ? ` · indisponible le ${S.unavailable.map((b) => `${dayNamesLower[b.day]} ${blockLabel(b)}`).join(', ')}`
        : '')
    );
  }
}
