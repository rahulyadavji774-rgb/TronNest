import { Router } from 'express';
import { WalletController } from '../controllers/wallet.controller';
import { authenticateUser } from '../middleware/auth.middleware';
import { sensitiveActionLimiter } from '../middleware/rate-limiter.middleware';

const router = Router();
const controller = new WalletController();

// All wallet endpoints are authenticated
router.use(authenticateUser);

router.get('/portfolio', controller.getPortfolio);
router.post('/transfer', sensitiveActionLimiter, controller.transferAssets);
router.get('/history', controller.getHistory);
router.get('/notifications', controller.getNotifications);
router.post('/notifications/read', controller.readNotifications);
router.get('/details', controller.getWalletDetails);
router.get('/trx-balance', controller.getTrxBalance);
router.get('/usdt-balance', controller.getUsdtBalance);
router.get('/resources', controller.getResources);
router.post('/send-trx', sensitiveActionLimiter, controller.sendTrx);
router.post('/send-usdt', sensitiveActionLimiter, controller.sendUsdt);
router.post('/broadcast', sensitiveActionLimiter, controller.broadcastTransaction);
router.get('/is-activated', controller.isActivated);
router.post('/private-key', sensitiveActionLimiter, controller.getPrivateKey);

export default router;
