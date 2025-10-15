module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/lib/**/*.js',
    '!src/lib/**/*.test.js'
  ],
  testMatch: [
    '**/test/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
}
