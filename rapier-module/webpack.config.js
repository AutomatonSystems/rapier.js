const CreateFileWebpack = require("create-file-webpack");
const CopyPlugin = require("copy-webpack-plugin");
const path = require("path");

function matchOtherDimRegex({is2d}) {
    if (is2d) {
        return /^ *\/\/ *#if +DIM3[\s\S]*?(?=#endif)#endif/gm;
    } else {
        return /^ *\/\/ *#if +DIM2[\s\S]*?(?=#endif)#endif/gm;
    }
}

function initCode({is2d}) {
    let dim = is2d ? "2d" : "3d";

    return `
// @ts-ignore
import wasmBase64 from "./rapier_wasm${dim}_bg.wasm";
import wasmInit from "./rapier_wasm${dim}";

/**
 * Initializes RAPIER.
 * Has to be called and awaited before using any library methods.
 */
export async function init() {
    await wasmInit(wasmBase64);
}`
}

function copyAndReplace({is2d}) {
    let dim = is2d ? "2d" : "3d";

    return {
        mode: "production",
        entry: {},
        plugins: [
            new CopyPlugin({
                patterns: [
                    // copy src.ts into build dir for compiling,
                    // remove sections wrapped in #ifdef DIMx ... #endif
                    // add init() function to rapier.ts
                    {
                        from: path.resolve(__dirname, "../src.ts"),
                        to: path.resolve(__dirname, `./build/pkg${dim}/`),
                        transform(content, path) {
                            let result = content
                                .toString()
                                .replace(matchOtherDimRegex({is2d}), "");

                            if (path.endsWith("rapier.ts")) {
                                result += initCode({is2d});
                            }
                            return result;
                        },
                    },
                    // copy package.json, adapting entries, LICENSE and README.md
                    {
                        from: path.resolve(__dirname, `./package.json`),
                        to: path.resolve(__dirname, `./dist/pkg${dim}/package.json`),
                        transform(content) {
                            let config = JSON.parse(content.toString());
                            config.name = `@dimforge/rapier${dim}-module`;
                            config.description += "";
                            config.type = "module";
                            config.types = "rapier.d.ts";
                            config.main = "rapier.js";
                            config.files = ["*"];
                            delete config.module;

                            return JSON.stringify(config, undefined, 2);
                        },
                    },
                    {
                        from: path.resolve(__dirname, `../LICENSE`),
                        to: path.resolve(__dirname, `../rapier-module/dist/pkg${dim}`),
                    },
                    {
                        from: path.resolve(__dirname, `../README.md`),
                        to: path.resolve(__dirname, `../rapier-module/dist/pkg${dim}/README.md`),
                    },
                ],
            }),
            // ts files import from raw.ts, create the file reexporting the wasm-bindgen exports.
            // the indirection simplifies switching between 2d and 3d
            new CreateFileWebpack({
                path: `./build/pkg${dim}/`,
                fileName: "raw.ts",
                content: `export * from "./rapier_wasm${dim}.js"`,
            }),
        ],
    };
}

function compile({is2d}) {
    let dim = is2d ? "2d" : "3d";

    return {
        mode: "production",
        entry: path.resolve(__dirname, `./build/pkg${dim}/rapier.ts`),
        module: {
            rules: [
                {
                    test: /\.wasm$/,
                    type: 'asset/inline'
                },
                {
                    test: /\.tsx?$/,
                    loader: "ts-loader",
                    exclude: /node_modules/,
                    options: {
                        compilerOptions: {
                            outDir: `./dist/pkg${dim}`,
                            lib: ["es6", "DOM"],
                        },
                    },
                },
            ],
        },
        resolve: {
            extensions: [".tsx", ".ts", ".js"]
        },
        output: {
            filename: "rapier.js",
            enabledChunkLoadingTypes: ["import-scripts"],
            chunkLoading: "import-scripts",
            wasmLoading: "fetch",
            path: path.resolve(__dirname, 'dist', `pkg${dim}`),
            library: {
                type: "module"
            }
        },
        optimization: {
            minimize: false
        },
        experiments: {
            asyncWebAssembly: true,
            outputModule: true,
            topLevelAwait: true
        }
    };
}

module.exports = [
    // 2d
    copyAndReplace({is2d: true}),
    compile({is2d: true}),

    // 3d
    //copyAndReplace({is2d: false}),
    //compile({is2d: false}),
];
