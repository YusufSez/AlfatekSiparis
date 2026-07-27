-- Normalize legacy ready tickets into preparing (ready step removed)
UPDATE "KitchenTicket" SET "status" = 'preparing' WHERE "status" = 'ready';
