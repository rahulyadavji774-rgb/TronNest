import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

const router = Router();
const controller = new AuthController();

// Wallet Creation & Imports
router.get('/check-address', controller.checkAddress);
router.post('/generate', controller.generateNewWalletAndMnemonic);
router.post('/finalize', controller.finalizeWalletSetup);
router.post('/import', controller.importWallet);
router.post('/verify-passcode', controller.verifyPasscodeAndLogin);
router.post('/change-passcode', controller.changePasscode);
router.post('/refresh', controller.refreshToken);
router.post('/logout', controller.logout);
router.post('/logout-all', controller.logoutAllDevices);

export default router;
