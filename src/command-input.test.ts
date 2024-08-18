import getopts from './command-input';

describe('getopts', () => {
    it('should parse command line arguments with options', () => {
        const argv = ['--name', 'John', '--age', '25'];
        const opts = {
            string: ['name'],
            default: { age: 18 },
        };
        const result = getopts(argv, opts);
        expect(result).toEqual({ name: 'John', age: 25, _: [] });
    });

    it('should parse command line arguments with boolean options', () => {
        const argv = ['--verbose', '--debug'];
        const opts = {
            boolean: ['verbose', 'debug'],
        };
        const result = getopts(argv, opts);
        expect(result).toEqual({ verbose: true, debug: true, _: [] });
    });

    it('should parse command line arguments with aliases', () => {
        const argv = ['-n', 'John', '-a', '25'];
        const opts = {
            alias: { n: 'name', a: 'age' },
        };
        const result = getopts(argv, opts);
        expect(result).toEqual({ n: 'John', name: 'John', age: 25, a: 25, _: [] });
    });

    it('should parse command line arguments with unknown options', () => {
        const argv = ['--name', 'John', '--age', '25', '--unknown', 'value'];
        const opts = {
            string: ['name'],
            default: { age: 18 },
            unknown: (key: string) => key.startsWith('unknown'),
        };
        const result = getopts(argv, opts);
        expect(result).toEqual({ name: 'John', age: 25, _: [], 'unknown': 'value' });
    });

    it('should parse command line arguments with stop early option', () => {
        const argv = ['--name', 'John', '--age', '25'];
        const opts = {
            string: ['name'],
            default: { age: 18 },
            stopEarly: true,
        };
        const result = getopts(argv, opts);
        expect(result).toEqual({ name: 'John', age: 25, _: [] });
    });
});