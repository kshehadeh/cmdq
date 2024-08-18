// Copyright © Jorge Bucaran <https://jorgebucaran.com>
// License: MIT
// This is a modified version of the original code. The original code can be found at
//  https://github.com/jorgebucaran/getopts

const EMPTYARR: Array<string> = []
const SHORTSPLIT = /$|[!-@[-`{-~][\s\S]*/g
const isArray = Array.isArray

const parseValue = function (any: string): string | boolean | number {
    if (any === "") return "";
    if (any === "false") return false;
    const maybe = +any;
    return maybe * 0 === 0 ? maybe : any;
};

interface AliasMap {
    [key: string]: string[];
}

const parseAlias = function (aliases: { [key: string]: string | string[] }): AliasMap {
    let out: AliasMap = {};
    let alias: string[];
    let prev: string[];
    let any: string | string[];

    for (let key in aliases) {
        any = aliases[key];
        alias = out[key] = isArray(any) ? any : [any];

        for (let i = 0; i < alias.length; i++) {
            prev = out[alias[i]] = [key];

            for (let k = 0; k < alias.length; k++) {
                if (i !== k) prev.push(alias[k]);
            }
        }
    }

    return out;
};

const parseDefault = function (aliases: AliasMap, defaults: { [key: string]: any }): { [key: string]: any } {
    let out: { [key: string]: any } = {};
    let alias: string[];
    let value: any;

    for (let key in defaults) {
        alias = aliases[key];
        value = defaults[key];

        out[key] = value;

        if (alias === undefined) {
            aliases[key] = EMPTYARR;
        } else {
            for (let i = 0; i < alias.length; i++) {
                out[alias[i]] = value;
            }
        }
    }

    return out;
};
const parseOptions = function (aliases: AliasMap, options: string[], value: any): { [key: string]: any } {
    let out: { [key: string]: any } = {};
    let key: string;
    let alias: string[];

    if (options !== undefined) {
        for (let i = 0; i < options.length; i++) {
            key = options[i];
            alias = aliases[key];

            out[key] = value;

            if (alias === undefined) {
                aliases[key] = [];
            } else {
                for (let k = 0; k < alias.length; k++) {
                    out[alias[k]] = value;
                }
            }
        }
    }

    return out;
};

const write = function (
    out: { [key: string]: any },
    key: string,
    value: any,
    aliases: AliasMap,
    unknown?: (key: string) => boolean
): void {
    let prev: any;
    let alias: string[] | undefined = aliases[key];
    let len: number = alias === undefined ? -1 : alias.length;

    if (len >= 0 || unknown === undefined || unknown(key)) {
        prev = out[key];

        if (prev === undefined) {
            out[key] = value;
        } else {
            if (Array.isArray(prev)) {
                prev.push(value);
            } else {
                out[key] = [prev, value];
            }
        }

        for (let i = 0; i < len; i++) {
            out[alias[i]] = out[key];
        }
    }
};

export default function getopts(argv: string[], opts: { [key: string]: any }): { [key: string]: any } {
    let unknown: ((key: string) => boolean) | undefined = (opts = opts || {}).unknown;
    let aliases: AliasMap = parseAlias(opts.alias);
    let strings: { [key: string]: any } = parseOptions(aliases, opts.string, "");
    let values: { [key: string]: any } = parseDefault(aliases, opts.default);
    let bools: { [key: string]: any } = parseOptions(aliases, opts.boolean, false);
    let stopEarly: boolean | undefined = opts.stopEarly;
    let _: string[] = [];
    let out: { [key: string]: any } = { _: _ };
    let key: string;
    let arg: string;
    let end: number;
    let match: RegExpMatchArray | null;
    let value: any;

    for (let i = 0, len = argv.length; i < len; i++) {
        arg = argv[i];

        if (arg[0] !== "-" || arg === "-") {
            if (stopEarly) {
                while (i < len) {
                    _.push(argv[i++]);
                }
            } else {
                _.push(arg);
            }
        } else if (arg === "--") {
            while (++i < len) {
                _.push(argv[i]);
            }
        } else if (arg[1] === "-") {
            end = arg.indexOf("=", 2);
            if (arg[2] === "n" && arg[3] === "o" && arg[4] === "-") {
                key = arg.slice(5, end >= 0 ? end : undefined);
                value = false;
            } else if (end >= 0) {
                key = arg.slice(2, end);
                value =
                    bools[key] !== undefined ||
                    (strings[key] === undefined
                        ? parseValue(arg.slice(end + 1))
                        : arg.slice(end + 1));
            } else {
                key = arg.slice(2);
                value =
                    bools[key] !== undefined ||
                    (len === i + 1 || argv[i + 1][0] === "-"
                        ? strings[key] === undefined
                            ? true
                            : ""
                        : strings[key] === undefined
                            ? parseValue(argv[++i])
                            : argv[++i]);
            }
            write(out, key, value, aliases, unknown);
        } else {
            SHORTSPLIT.lastIndex = 2;
            match = SHORTSPLIT.exec(arg);
            end = match!.index || -1;
            value = match![0];

            for (let k = 1; k < end; k++) {
                write(
                    out,
                    (key = arg[k]),
                    k + 1 < end
                        ? strings[key] === undefined ||
                        arg.substring(k + 1, (k = end)) + value
                        : value === ""
                            ? len === i + 1 || argv[i + 1][0] === "-"
                                ? strings[key] === undefined || ""
                                : bools[key] !== undefined ||
                                (strings[key] === undefined ? parseValue(argv[++i]) : argv[++i])
                            : bools[key] !== undefined ||
                            (strings[key] === undefined ? parseValue(value) : value),
                    aliases,
                    unknown
                );
            }
        }
    }

    for (let key in values) if (out[key] === undefined) out[key] = values[key];
    for (let key in bools) if (out[key] === undefined) out[key] = false;
    for (let key in strings) if (out[key] === undefined) out[key] = "";

    return out;
}