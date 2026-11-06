import { registerHooks } from 'node:module'

// Match the bundler's extensionless TypeScript imports in the Node test runner.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context) }
    catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw error
      return nextResolve(specifier + '.ts', context)
    }
  },
})
