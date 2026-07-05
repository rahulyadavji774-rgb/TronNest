import re

with open('server.ts', 'r') as f:
    content = f.read()

# Remove apiLimiter and authLimiter configuration
content = re.sub(r'  // 3\. Rate Limiting \(API Protection\).*?const authLimiter = rateLimit\(\{.*?\}\);\n', '', content, flags=re.DOTALL)

# Remove limiters from app.use
content = content.replace("app.use('/api/', apiLimiter);\n", "")
content = content.replace("app.use('/api/auth', authLimiter, authRoutes);", "app.use('/api/auth', authRoutes);")

with open('server.ts', 'w') as f:
    f.write(content)
