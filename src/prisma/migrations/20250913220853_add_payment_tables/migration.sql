-- CreateTable
CREATE TABLE "public"."payment_intents" (
    "id" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'inr',
    "paymentMethod" TEXT NOT NULL,
    "metadata" JSONB,
    "error" JSONB,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "reservation_id" TEXT,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."refunds" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_intent_id" TEXT NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_reservation_id_key" ON "public"."payment_intents"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_payment_intent_id_key" ON "public"."refunds"("payment_intent_id");

-- AddForeignKey
ALTER TABLE "public"."payment_intents" ADD CONSTRAINT "payment_intents_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."refunds" ADD CONSTRAINT "refunds_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
