import os
import glob

# For all route files, replace sensitiveActionLimiter with nothing
for file in glob.glob('backend/src/routes/*.ts'):
    with open(file, 'r') as f:
        content = f.read()
    
    content = content.replace("import { sensitiveActionLimiter } from '../middleware/rate-limiter.middleware';\n", "")
    content = content.replace(", sensitiveActionLimiter", "")
    
    with open(file, 'w') as f:
        f.write(content)

