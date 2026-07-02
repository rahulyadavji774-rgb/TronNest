import { Router } from 'express';
import { WalletController } from '../controllers/wallet.controller';
import { authenticateUser } from '../middleware/auth.middleware';
import { sensitiveActionLimiter } from '../middleware/rate-limiter.middleware';

const router = Router();
const controller = new WalletController();

// All wallet endpoints are authenticated
router.use(authenticateUser);

router.get('/portfolio', controller.getPortfolio);
router.get('/market', controller.getMarketData);
router.post('/transfer', sensitiveActionLimiter, controller.transferAssets);
router.get('/history', controller.getHistory);
router.get('/notifications', controller.getNotifications);
router.post('/notifications/read', controller.readNotifications);
router.delete('/notifications/:id', controller.deleteNotification);
router.post('/notifications/:id/read', controller.readSingleNotification);

router.get('/list', controller.listWallets);
router.post('/create', controller.createWallet);
router.post('/import-new', controller.importWalletEndpoint);
router.post('/rename', controller.renameWallet);
router.post('/customize', controller.customizeWallet);
router.post('/switch', controller.switchWallet);
router.delete('/delete/:id', controller.deleteWallet);
router.post('/backup-confirm', controller.confirmBackup);

router.get('/security/settings', controller.getSecuritySettings);
router.post('/security/settings', controller.updateSecuritySettings);
router.get('/security/login-history', controller.getLoginHistory);
router.post('/security/log-login', controller.logLogin);
router.get('/security/trusted-devices', controller.getTrustedDevices);
router.delete('/security/trusted-device/:id', controller.deleteTrustedDevice);
router.post('/security/export-backup', controller.exportBackup);
router.post('/security/import-backup', controller.importBackup);

router.get('/details', controller.getWalletDetails);
router.get('/trx-balance', controller.getTrxBalance);
router.get('/usdt-balance', controller.getUsdtBalance);
router.get('/resources', controller.getResources);
router.post('/send-trx', sensitiveActionLimiter, controller.sendTrx);
router.post('/send-usdt', sensitiveActionLimiter, controller.sendUsdt);
router.post('/broadcast', sensitiveActionLimiter, controller.broadcastTransaction);
router.get('/is-activated', controller.isActivated);
router.get('/tx-status', controller.getTransactionStatus);
router.post('/private-key', sensitiveActionLimiter, controller.getPrivateKey);

export default router;
