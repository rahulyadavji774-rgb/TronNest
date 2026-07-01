import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticateAdmin } from '../middleware/auth.middleware';
import { sensitiveActionLimiter } from '../middleware/rate-limiter.middleware';

const router = Router();
const controller = new AdminController();

// Unauthenticated admin routes
router.post('/login', sensitiveActionLimiter, controller.adminLogin);

// Authenticated admin routes
router.use(authenticateAdmin);

router.get('/dashboard-stats', controller.getDashboardStats);
router.get('/users', controller.listUsers);
router.post('/users/freeze', controller.freezeWallet);
router.post('/users/unfreeze', controller.unfreezeWallet);

router.get('/tokens', controller.listTokens);
router.post('/tokens/create', controller.createToken);
router.post('/tokens/update', controller.updateToken);
router.post('/tokens/hide', controller.hideToken);
router.post('/tokens/show', controller.showToken);
router.post('/tokens/enable-transfer', controller.enableTransfer);
router.post('/tokens/disable-transfer', controller.disableTransfer);
router.post('/tokens/toggle-visibility', controller.toggleTokenVisibility);
router.post('/tokens/change-price', controller.changeTokenPrice);
router.delete('/tokens/:tokenId', controller.deleteToken);

router.post('/tokens/mint', controller.mintTokens);
router.post('/tokens/deduct', controller.deductTokens);

router.get('/ledger', controller.getLedger);
router.get('/users/:userId/balances', controller.getUserBalances);
router.post('/users/balances/freeze', controller.freezeUserBalance);
router.post('/users/balances/unfreeze', controller.unfreezeUserBalance);
router.post('/users/balances/reset', controller.resetUserBalance);
router.post('/users/balances/credit', controller.creditUserBalance);
router.post('/users/balances/debit', controller.debitUserBalance);

router.get('/audit-logs', controller.getAuditLogs);

export default router;
