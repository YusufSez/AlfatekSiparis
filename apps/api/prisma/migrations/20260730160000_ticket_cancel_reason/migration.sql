-- Persist why a kitchen ticket was cancelled (SQLite TEXT enum).
ALTER TABLE "KitchenTicket" ADD COLUMN "cancelReason" TEXT;
