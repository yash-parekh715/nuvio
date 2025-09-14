-- AlterTable
ALTER TABLE "public"."bookings" ADD COLUMN     "refund_amount" DECIMAL(10,2),
ADD COLUMN     "refund_id" TEXT,
ADD COLUMN     "refund_status" TEXT,
ADD COLUMN     "refunded_at" TIMESTAMP(3);
