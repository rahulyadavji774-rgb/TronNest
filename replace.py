import re

with open('backend/src/controllers/wallet.controller.ts', 'r') as f:
    content = f.read()

pattern = r"const security = await this\.db\.findOne<any>\('wallet_security', s => s\.wallet_id === user\.walletId\);\s+if \(!security\) \{\s+return res\.status\(404\)\.json\(\{ success: false, message: 'Wallet security profile missing' \}\);\s+\}\s+const isPasscodeCorrect = await bcrypt\.compare\(passcode, security\.passcode_hash\);\s+if \(!isPasscodeCorrect\) \{\s+return res\.status\(401\)\.json\(\{ success: false, message: '[^']+' \}\);\s+\}"

replacement = """const verifyRes = await verifyPasscodeWithRateLimit(user.walletId, passcode);
      if (!verifyRes.success) {
        return res.status(verifyRes.status!).json({ success: false, message: verifyRes.message });
      }"""

new_content = re.sub(pattern, replacement, content)

with open('backend/src/controllers/wallet.controller.ts', 'w') as f:
    f.write(new_content)
