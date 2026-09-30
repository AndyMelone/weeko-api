-- CreateEnum
CREATE TYPE "ServiceKind" AS ENUM ('eleve', 'site');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('prevue', 'faite', 'manquee', 'rattrapee');

-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('normal', 'rattrapage');

-- CreateEnum
CREATE TYPE "Who" AS ENUM ('moi', 'eleve');

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "first" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "kind" "ServiceKind" NOT NULL,
    "perWeek" INTEGER NOT NULL DEFAULT 0,
    "noWeekend" BOOLEAN NOT NULL DEFAULT false,
    "exDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "notBefore" INTEGER,
    "notAfter" INTEGER,
    "phone" TEXT NOT NULL DEFAULT '',
    "phoneLabel" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedSlot" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "start" INTEGER NOT NULL,

    CONSTRAINT "FixedSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolClass" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "defaultCount" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SchoolClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "start" INTEGER NOT NULL,
    "end" INTEGER NOT NULL,
    "svc" TEXT NOT NULL,
    "cls" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'prevue',
    "kind" "SessionKind" NOT NULL DEFAULT 'normal',
    "dueId" TEXT,
    "who" "Who",
    "motif" TEXT NOT NULL DEFAULT '',
    "noRedo" BOOLEAN NOT NULL DEFAULT false,
    "fixed" BOOLEAN NOT NULL DEFAULT false,
    "base" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Due" (
    "id" TEXT NOT NULL,
    "svc" TEXT NOT NULL,
    "cls" TEXT,
    "from" TEXT NOT NULL,
    "who" "Who" NOT NULL,
    "motif" TEXT NOT NULL,
    "placedSession" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Due_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekPrep" (
    "week" INTEGER NOT NULL,
    "off" TEXT[],
    "counts" JSONB NOT NULL DEFAULT '{}',
    "changes" JSONB NOT NULL DEFAULT '{}',
    "include" JSONB NOT NULL DEFAULT '{}',
    "generated" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeekPrep_pkey" PRIMARY KEY ("week")
);

-- CreateTable
CREATE TABLE "BaseSlot" (
    "id" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "start" INTEGER NOT NULL,
    "end" INTEGER NOT NULL,
    "svc" TEXT NOT NULL,
    "cls" TEXT,
    "kind" "SessionKind" NOT NULL DEFAULT 'normal',
    "dueId" TEXT,
    "fixed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BaseSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoryEntry" (
    "id" TEXT NOT NULL,
    "svc" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL,
    "motif" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HistoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FixedSlot_serviceId_day_key" ON "FixedSlot"("serviceId", "day");

-- CreateIndex
CREATE INDEX "Session_week_idx" ON "Session"("week");

-- CreateIndex
CREATE INDEX "Session_svc_idx" ON "Session"("svc");

-- AddForeignKey
ALTER TABLE "FixedSlot" ADD CONSTRAINT "FixedSlot_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_svc_fkey" FOREIGN KEY ("svc") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_cls_fkey" FOREIGN KEY ("cls") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Due" ADD CONSTRAINT "Due_svc_fkey" FOREIGN KEY ("svc") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Due" ADD CONSTRAINT "Due_cls_fkey" FOREIGN KEY ("cls") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseSlot" ADD CONSTRAINT "BaseSlot_svc_fkey" FOREIGN KEY ("svc") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseSlot" ADD CONSTRAINT "BaseSlot_cls_fkey" FOREIGN KEY ("cls") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoryEntry" ADD CONSTRAINT "HistoryEntry_svc_fkey" FOREIGN KEY ("svc") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
