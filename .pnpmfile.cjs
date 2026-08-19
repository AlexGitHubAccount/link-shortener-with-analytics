function readPackage(pkg) {
  if (pkg.name === 'prisma' || pkg.name === '@prisma/engines' || pkg.name === 'unrs-resolver') {
    if (!pkg.pnpm) {
      pkg.pnpm = {};
    }
    pkg.pnpm.allowBuild = true;
  }
  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
