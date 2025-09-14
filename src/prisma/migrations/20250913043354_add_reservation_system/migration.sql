-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."BookingStatus" ADD VALUE 'RESERVED';
ALTER TYPE "public"."BookingStatus" ADD VALUE 'PAYMENT_FAILED';

-- AlterTable
ALTER TABLE "public"."bookings" ADD COLUMN     "payment_intent_id" TEXT,
ADD COLUMN     "reservation_expiry" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "bookings_reservation_expiry_idx" ON "public"."bookings"("reservation_expiry");
