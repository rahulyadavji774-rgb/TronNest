function snakeToCamel(str) {
  return str.replace(/([-_][a-z])/ig, ($1) => {
    return $1.toUpperCase()
      .replace('-', '')
      .replace('_', '');
  });
}

function convertKeysToCamel(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const newObj = {};
  for (const key in obj) {
    newObj[snakeToCamel(key)] = obj[key];
  }
  return newObj;
}

console.log(convertKeysToCamel({ user_id: '123', is_locked: false }));
