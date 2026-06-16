import baseConfig from "./eslint.config.mjs";

export default [
    ...baseConfig,
    {
        rules: {
            "complexity": ["error", 10],
            "max-lines-per-function": ["error", { "max": 60, "skipBlankLines": true, "skipComments": true }],
            "max-lines": ["error", { "max": 500, "skipBlankLines": true, "skipComments": true }],
        }
    }
];
