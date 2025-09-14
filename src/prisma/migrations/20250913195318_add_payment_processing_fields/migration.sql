-- AlterTable
ALTER TABLE "public"."bookings" ADD COLUMN     "payment_initiated_at" TIMESTAMP(3),
ADD COLUMN     "payment_processing" BOOLEAN NOT NULL DEFAULT false;
