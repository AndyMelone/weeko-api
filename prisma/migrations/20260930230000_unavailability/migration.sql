-- CreateTable
CREATE TABLE "Unavailability" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT,
    "day" INTEGER NOT NULL,
    "start" INTEGER NOT NULL,
    "end" INTEGER NOT NULL,

    CONSTRAINT "Unavailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Unavailability_serviceId_idx" ON "Unavailability"("serviceId");

-- AddForeignKey
ALTER TABLE "Unavailability" ADD CONSTRAINT "Unavailability_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
