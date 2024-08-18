import { CommandChain } from './command-chain';

jest.mock('fs', () => {
    return {
        writeFileSync: jest.fn(),
        readFileSync: jest.fn().mockReturnValue('{"commands":[{"id":"1","command":"echo \\"Hello\\"","out":"Hello\\n","err":""}]}')
    };
});


describe('CommandChain', () => {
    let commandChain: CommandChain;

    beforeEach(() => {
        commandChain = new CommandChain('.');    
    });

    afterEach(() => {
        commandChain.reset();
    });

    it('should add a command to the command chain', () => {
        commandChain.add('echo "Hello, World!"');
        expect(commandChain.commands.length).toBe(1);
    });

    it('should run all commands in the command chain', () => {
        commandChain.add('echo "Hello"').add('echo "World"');
        commandChain.run();
        expect(commandChain.results.length).toBe(2);
    });

    it('should get a command result by id', () => {
        commandChain.add('echo "Hello"');
        commandChain.run();
        const result = commandChain.get(commandChain.results[0].id);
        expect(result).toEqual(commandChain.results[0]);
    });

    it('should get a command result by index', () => {
        commandChain.add('echo "Hello"');
        commandChain.run();
        const result = commandChain.get(0);
        expect(result).toEqual(commandChain.results[0]);
    });

    it('should return undefined when getting a non-existent command result', () => {
        const result = commandChain.get('non-existent-id');
        expect(result).toBeUndefined();
    });

    it('should return the first command result', () => {
        commandChain.add('echo "Hello"').add('echo "World"');
        commandChain.run();
        const result = commandChain.first();
        expect(result).toEqual(commandChain.results[0]);
    });

    it('should return the last command result', () => {
        commandChain.add('echo "Hello"').add('echo "World"');
        commandChain.run();
        const result = commandChain.last();
        expect(result).toEqual(commandChain.results[1]);
    });

    it('should return the output of the first command', () => {
        commandChain.add('echo "Hello"').add('echo "World"');
        commandChain.run();
        const output = commandChain.firstOut();
        expect(output).toBe('Hello');
    });

    it('should return the output of the last command', () => {
        commandChain.add('echo "Hello"').add('echo "World"').run();        
        const output = commandChain.lastOut();
        expect(output).toBe('World');
    });

    it('should save the command chain to a file', () => {
        commandChain.add('echo "Hello"').add('echo "World"');
        const saved = commandChain.save('/path/to/save/file.json', false);
        expect(saved).toBe(true);
    });

    it('should load canned results from a file during dry run', () => {
        process.env.DRYRUN = 'true';
        process.env.RECORDER_PATH = '/path/to/canned/results.json';
        commandChain.add('echo "Hello"');
        const result = commandChain.run().first();
        expect(result?.out).toBe('Hello\n');
    });
});