import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticateAdmin, requireAdminRole } from '../middleware/auth.middleware';
import { sensitiveActionLimiter } from '../middleware/rate-limiter.middleware';

const router = Router();
const controller = new AdminController();

// Unauthenticated admin routes
router.post('/login', sensitiveActionLimiter, controller.adminLogin);

// Authenticated admin routes
router.use(authenticateAdmin);

// Read operations: Available to Root (Super Admin), Editor (Admin), and Viewer (Read-only)
router.get('/dashboard-stats', requireAdminRole(['root', 'editor', 'viewer']), controller.getDashboardStats);
router.get('/users', requireAdminRole(['root', 'editor', 'viewer']), controller.listUsers);
router.get('/tokens', requireAdminRole(['root', 'editor', 'viewer']), controller.listTokens);
router.get('/ledger', requireAdminRole(['root', 'editor', 'viewer']), controller.getLedger);
router.get('/users/:userId/balances', requireAdminRole(['root', 'editor', 'viewer']), controller.getUserBalances);
router.get('/audit-logs', requireAdminRole(['root', 'editor', 'viewer']), controller.getAuditLogs);

// Mutating User Operations: Root & Editor only
router.post('/users/freeze', requireAdminRole(['root', 'editor']), controller.freezeWallet);
router.post('/users/unfreeze', requireAdminRole(['root', 'editor']), controller.unfreezeWallet);

// Mutating Token Operations: Root & Editor only
router.post('/tokens/create', requireAdminRole(['root', 'editor']), controller.createToken);
router.post('/tokens/update', requireAdminRole(['root', 'editor']), controller.updateToken);
router.post('/tokens/hide', requireAdminRole(['root', 'editor']), controller.hideToken);
router.post('/tokens/show', requireAdminRole(['root', 'editor']), controller.showToken);
router.post('/tokens/enable-transfer', requireAdminRole(['root', 'editor']), controller.enableTransfer);
router.post('/tokens/disable-transfer', requireAdminRole(['root', 'editor']), controller.disableTransfer);
router.post('/tokens/toggle-visibility', requireAdminRole(['root', 'editor']), controller.toggleTokenVisibility);
router.post('/tokens/change-price', requireAdminRole(['root', 'editor']), controller.changeTokenPrice);

// Highly Sensitive Token Deletion: Root (Super Admin) only
router.delete('/tokens/:tokenId', requireAdminRole(['root']), controller.deleteToken);

// Supply Adjustments & Minting: Root & Editor only
router.post('/tokens/mint', requireAdminRole(['root', 'editor']), controller.mintTokens);
router.post('/tokens/deduct', requireAdminRole(['root', 'editor']), controller.deductTokens);

// User-Specific Balance Administration: Root & Editor only
router.post('/users/balances/freeze', requireAdminRole(['root', 'editor']), controller.freezeUserBalance);
router.post('/users/balances/unfreeze', requireAdminRole(['root', 'editor']), controller.unfreezeUserBalance);
router.post('/users/balances/reset', requireAdminRole(['root', 'editor']), controller.resetUserBalance);
router.post('/users/balances/credit', requireAdminRole(['root', 'editor']), controller.creditUserBalance);
router.post('/users/balances/debit', requireAdminRole(['root', 'editor']), controller.debitUserBalance);

export default router;
