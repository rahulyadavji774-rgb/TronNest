import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticateAdmin, requireAdminRole } from '../middleware/auth.middleware';

const router = Router();
const controller = new AdminController();

// Unauthenticated admin routes
router.post('/login', controller.adminLogin);

// Authenticated admin routes
router.use(authenticateAdmin);

// Read operations: Available to Root (Super Admin), Editor (Admin), and Viewer (Read-only)
router.get('/dashboard-stats', requireAdminRole(['root', 'editor', 'viewer']), controller.getDashboardStats);
router.get('/users', requireAdminRole(['root', 'editor', 'viewer']), controller.listUsers);
router.get('/tokens', requireAdminRole(['root', 'editor', 'viewer']), controller.listTokens);
router.get('/ledger', requireAdminRole(['root', 'editor', 'viewer']), controller.getLedger);
router.get('/users/:userId/balances', requireAdminRole(['root', 'editor', 'viewer']), controller.getUserBalances);
router.get('/audit-logs', requireAdminRole(['root', 'editor', 'viewer']), controller.getAuditLogs);

// Mutating User Operations: Root & Editor
router.post('/users/freeze', requireAdminRole(['root', 'editor']), controller.freezeWallet);
router.post('/users/unfreeze', requireAdminRole(['root', 'editor']), controller.unfreezeWallet);
router.post('/users/suspend-transfers', requireAdminRole(['root']), controller.suspendUserTransfers);
router.post('/users/restore-transfers', requireAdminRole(['root']), controller.restoreUserTransfers);

// Mutating Token Operations: Root only for some
router.post('/tokens/create', requireAdminRole(['root', 'editor']), controller.createToken);
router.post('/tokens/update', requireAdminRole(['root', 'editor']), controller.updateToken);
router.post('/tokens/hide', requireAdminRole(['root', 'editor']), controller.hideToken);
router.post('/tokens/show', requireAdminRole(['root', 'editor']), controller.showToken);
router.post('/tokens/enable-transfer', requireAdminRole(['root', 'editor']), controller.enableTransfer);
router.post('/tokens/disable-transfer', requireAdminRole(['root', 'editor']), controller.disableTransfer);

router.post('/tokens/enable-trading', requireAdminRole(['root', 'editor']), controller.enableTrading);
router.post('/tokens/disable-trading', requireAdminRole(['root', 'editor']), controller.disableTrading);

router.post('/tokens/enable-deposit', requireAdminRole(['root', 'editor']), controller.enableDeposit);
router.post('/tokens/disable-deposit', requireAdminRole(['root', 'editor']), controller.disableDeposit);

router.post('/tokens/enable-withdraw', requireAdminRole(['root', 'editor']), controller.enableWithdraw);
router.post('/tokens/disable-withdraw', requireAdminRole(['root', 'editor']), controller.disableWithdraw);

router.post('/tokens/toggle-visibility', requireAdminRole(['root', 'editor']), controller.toggleTokenVisibility);
router.post('/tokens/change-price', requireAdminRole(['root']), controller.changeTokenPrice);

// Highly Sensitive Token Deletion: Root (Super Admin) only
router.delete('/tokens/:tokenId', requireAdminRole(['root']), controller.deleteToken);

// Supply Adjustments & Minting: Root only
router.post('/tokens/mint', requireAdminRole(['root']), controller.mintTokens);
router.post('/tokens/deduct', requireAdminRole(['root']), controller.deductTokens);
router.post('/tokens/lock-supply', requireAdminRole(['root']), controller.lockSupply);
router.post('/tokens/unlock-supply', requireAdminRole(['root']), controller.unlockSupply);

// User-Specific Balance Administration: Root only
router.post('/users/balances/freeze', requireAdminRole(['root']), controller.freezeUserBalance);
router.post('/users/balances/unfreeze', requireAdminRole(['root']), controller.unfreezeUserBalance);
router.post('/users/balances/reset', requireAdminRole(['root']), controller.resetUserBalance);
router.post('/users/balances/credit', requireAdminRole(['root']), controller.creditUserBalance);
router.post('/users/balances/debit', requireAdminRole(['root']), controller.debitUserBalance);

export default router;
