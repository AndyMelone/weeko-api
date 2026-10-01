-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "billing" TEXT NOT NULL DEFAULT 'seance',
ADD COLUMN     "rate" INTEGER;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "calendarToken" TEXT;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidOn" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_serviceId_idx" ON "Payment"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_calendarToken_key" ON "Settings"("calendarToken");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

