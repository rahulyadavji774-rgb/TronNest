import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { sensitiveActionLimiter } from '../middleware/rate-limiter.middleware';

const router = Router();
const controller = new AuthController();

// Wallet Creation & Imports
router.get('/check-address', controller.checkAddress);
router.post('/generate', sensitiveActionLimiter, controller.generateNewWalletAndMnemonic);
router.post('/finalize', sensitiveActionLimiter, controller.finalizeWalletSetup);
router.post('/import', sensitiveActionLimiter, controller.importWallet);
router.post('/verify-passcode', sensitiveActionLimiter, controller.verifyPasscodeAndLogin);
router.post('/refresh', controller.refreshToken);
router.post('/logout', controller.logout);
router.post('/logout-all', controller.logoutAllDevices);

export default router;
