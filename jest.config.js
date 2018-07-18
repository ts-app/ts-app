module.exports = {
  "verbose": true,
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "testMatch": [
    "**/tests/**/*.test.ts?(x)"
  ],
  "coverageDirectory": "dist/coverage",
  "collectCoverageFrom": [
    "src/**/*.{ts,tsx,js,jsx}"
  ],
  "coveragePathIgnorePatterns": [".*\\.d\\.ts", "<rootDir>/node_modules/"],
  "moduleFileExtensions": [
    "ts",
    "tsx",
    "js",
    "json"
  ],
  "globals": {
    "ts-jest": {
      "skipBabel": true,
      "tsConfigFile": "./config/tsconfig-test.json"
    }
  },
  "testEnvironment": "node"
};
