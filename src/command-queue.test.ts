import { CommandQueue, q } from './command-queue';
import fs from 'fs';
import os from 'os';
import path from 'path';
import child_process, { spawn } from 'child_process';
import { setGlobalConfig } from './context';

describe('CommandQueue', () => {
    let commandQueue: CommandQueue;

    beforeEach(() => {
        commandQueue = new CommandQueue('.');    
    });

    afterEach(() => {
        commandQueue.reset();
    });

    it('should add a command to the command queue', () => {
        commandQueue.add('echo "Hello, World!"');
        expect(commandQueue.commands.length).toBe(1);
    });

    it('should run all commands in the command queue', () => {
        commandQueue.add('echo "Hello"').add('echo "World"');
        commandQueue.run();
        expect(commandQueue.results.length).toBe(2);
    });

    it('should get a command result by id', () => {
        commandQueue.add('echo "Hello"');
        commandQueue.run();
        const result = commandQueue.get(commandQueue.results[0].id);
        expect(result).toEqual(commandQueue.results[0]);
    });

    it('should get a command result by index', () => {
        commandQueue.add('echo "Hello"');
        commandQueue.run();
        const result = commandQueue.get(0);
        expect(result).toEqual(commandQueue.results[0]);
    });

    it('should return undefined when getting a non-existent command result', () => {
        const result = commandQueue.get('non-existent-id');
        expect(result).toBeUndefined();
    });

    it('should return the first command result', () => {
        commandQueue.add('echo "Hello"').add('echo "World"');
        commandQueue.run();
        const result = commandQueue.first();
        expect(result).toEqual(commandQueue.results[0]);
    });

    it('should return the last command result', () => {
        commandQueue.add('echo "Hello"').add('echo "World"');
        commandQueue.run();
        const result = commandQueue.last();
        expect(result).toEqual(commandQueue.results[1]);
    });

    it('should return the output of the first command', () => {
        commandQueue.add('echo "Hello"').add('echo "World"');
        commandQueue.run();
        const output = commandQueue.firstOut();
        expect(output).toBe('Hello');
    });

    it('should return the output of the last command', () => {
        commandQueue.add('echo "Hello"').add('echo "World"').run();        
        const output = commandQueue.lastOut();
        expect(output).toBe('World');
    });

    it('should load canned results from a file during dry run', () => {
        process.env.DRYRUN = 'true';
        process.env.RECORDER_PATH = '/path/to/canned/results.json';
        commandQueue.add('echo "Hello"');
        const result = commandQueue.run().first();
        expect(result?.out).toBe('Hello\n');
    });

    it('should run post command functions', () => {
        commandQueue
            .add('echo "Hello"')
            .add('echo "World"', {
                post: (result) => {
                    return {
                        ...result,
                        out: result.out.toUpperCase()
                    }
                }
            })
            .run();
        const result = commandQueue.last();
        expect(result?.out).toBe('WORLD\n');
    });

    it('should run pre command functions', () => {
        commandQueue
            .add('echo "Hello"', {
                pre: (result) => {
                    return false;
                }
            })
            .run();
        const result = commandQueue.last();
        expect(result).toBeUndefined();
    });

    it('should use global config if none given', () => {
        setGlobalConfig({ workingDirectory: '.', enableTrace: true });
        const queue = q();                
        expect(queue.config.enableTrace).toBe(true);

        queue.cmd('ls').run();
        expect(queue.lastOut()).not.toBe('');
    })
});

describe('pipes', () => {
    it('should pipe the output of one command to another', () => {
        const commandQueue = new CommandQueue('.');
        commandQueue.add('echo "Hello"').pipe('grep "Hello"').run();
        const result = commandQueue.last();
        expect(result?.out).toBe('Hello\n');
    });

    it('should run post command functions on piped commands', () => {
        const commandQueue = new CommandQueue('.');
        commandQueue.add('echo "Hello"').pipe('grep "Hello"', {
            post: (result) => {
                return {
                    ...result,
                    out: result.out.toUpperCase()
                }
            }
        }).run();
        const result = commandQueue.last();
        expect(result?.out).toBe('HELLO\n');
    });

    it('should pipe stderr when specified', () => {
        const commandQueue = new CommandQueue('.');

        // First verify that the command sends hello to stdout
        commandQueue.add('echo "Hello"').pipe('grep "Hello"', { pipe: 'stdout' }).run();
        const result = commandQueue.last();
        expect(result?.out.trim()).toBe('Hello');

        // Now verify that we get nothing when we pipe stderr
        commandQueue.add('echo "Hello"').pipe('grep "Hello"', { pipe: 'stderr' }).run();
        const result2 = commandQueue.last();
        expect(result2?.out.trim()).toBe('');

        // Now verify that we get hello when we pipe both
        commandQueue.add('echo "Hello"').pipe('grep "Hello"', { pipe: 'both' }).run();
        const result3 = commandQueue.last();
        expect(result3?.out.trim()).toBe('Hello');
    })

    it('should run pre command functions on piped commands', () => {
        const commandQueue = new CommandQueue('.');
        commandQueue.add('echo "Hello"').pipe('grep "Hello"', {
            pre: (result) => {
                return false;
            }
        }).run();
        const result = commandQueue.last();
        expect(result?.out.trim()).toEqual('Hello');
    });
})

describe('errors', () => {
    it('should return a record of commands that failed along with their error messages', () => {
        const commandQueue = new CommandQueue('.');
        commandQueue.add('echo "Hello"').add('invalid-command').add('echo "World"');
        commandQueue.run();
        const errorRecord = commandQueue.errors();
        expect(errorRecord).toEqual({
            'invalid-command': '/bin/sh: invalid-command: command not found\n',
        });

        const flattenedErrors = commandQueue.flattenErrors();
        expect(flattenedErrors).toBe('/bin/sh: invalid-command: command not found');

        expect(commandQueue.hasErrors()).toBe(true);
    });

    it('should return an empty record if all commands were successful', () => {
        const commandQueue = new CommandQueue('.');
        commandQueue.add('echo "Hello"').add('echo "World"');
        commandQueue.run();
        const errorRecord = commandQueue.errors();
        expect(errorRecord).toEqual({});
        expect(commandQueue.success()).toBe(true);
    });
});

describe('save', () => {

    let tempFilePath: string;

    beforeEach(() => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(),'command-queue-test-'));
        const tempFileName = 'commands.json';
        tempFilePath = `${tempDir}/${tempFileName}`;    
    })

    it('should save the commands to a file', () => {
        const commandQueue = new CommandQueue('.');
        commandQueue.add('echo "Hello"').add('echo "World"').run();
        const saved = commandQueue.save(tempFilePath, false);
        expect(saved).toBe(true);

        // Read the contents of the file
        const raw = fs.readFileSync(tempFilePath, 'utf-8');
        const commands = JSON.parse(raw);

        expect(commands).toEqual({
            'echo "Hello"': {
                id: expect.any(String),
                command: 'echo "Hello"',
                out: 'Hello\n',
                err: '',
                stat: 0,
                result: {
                    success: true,
                    message: '',
                },
            },
            'echo "World"': {
                id: expect.any(String),
                command: 'echo "World"',
                out: 'World\n',
                err: '',
                stat: 0,
                result: {
                    success: true,
                    message: '',
                },
            },
        });
    });

    it('should append the commands to an existing file', () => {
        // Create an existing file with some commands
        const existingCommands = {
            'echo "Existing Command"': {
                id: 'existing-command-id',
                command: 'echo "Existing Command"',
                out: '',
                err: '',
                stat: 0,
                result: {
                    success: true,
                    message: '',
                },
            },
        };
        fs.writeFileSync(tempFilePath, JSON.stringify(existingCommands));

        const commandQueue = new CommandQueue('.');
        commandQueue.add('echo "Hello"').add('echo "World"').run();
        const saved = commandQueue.save(tempFilePath, true);
        expect(saved).toBe(true);

        // Read the contents of the file
        const raw = fs.readFileSync(tempFilePath, 'utf-8');
        const commands = JSON.parse(raw);

        expect(commands).toEqual({
            'echo "Existing Command"': existingCommands['echo "Existing Command"'],
            'echo "Hello"': {
                id: expect.any(String),
                command: 'echo "Hello"',
                out: 'Hello\n',
                err: '',
                stat: 0,
                result: {
                    success: true,
                    message: '',
                },
            },
            'echo "World"': {
                id: expect.any(String),
                command: 'echo "World"',
                out: 'World\n',
                err: '',
                stat: 0,
                result: {
                    success: true,
                    message: '',
                },
            },
        });
    });

    it('should overwrite an existing file when append is false', () => {
        // Create an existing file with some commands
        const existingCommands = {
            'echo "Existing Command"': {
                id: 'existing-command-id',
                command: 'echo "Existing Command"',
                out: '',
                err: '',
                stat: 0,
                result: {
                    success: true,
                    message: '',
                },
            },
        };
        fs.writeFileSync(tempFilePath, JSON.stringify(existingCommands));

        const commandQueue = new CommandQueue('.');
        commandQueue.add('echo "Hello"').add('echo "World"').run();
        const saved = commandQueue.save(tempFilePath, false);
        expect(saved).toBe(true);

        // Read the contents of the file
        const raw = fs.readFileSync(tempFilePath, 'utf-8');
        const commands = JSON.parse(raw);

        expect(commands).toEqual({
            'echo "Hello"': {
                id: expect.any(String),
                command: 'echo "Hello"',
                out: 'Hello\n',
                err: '',
                stat: 0,
                result: {
                    success: true,
                    message: '',
                },
            },
            'echo "World"': {
                id: expect.any(String),
                command: 'echo "World"',
                out: 'World\n',
                err: '',
                stat: 0,
                result: {
                    success: true,
                    message: '',
                },
            },
        });
    });

    it('should return false if there was an error saving the commands', () => {
        // Create a read-only file
        fs.writeFileSync(tempFilePath, '', { mode: 0o444 });

        const commandQueue = new CommandQueue('.');
        commandQueue.add('echo "Hello"').add('echo "World"').run();
        const saved = commandQueue.save(tempFilePath, false);
        expect(saved).toBe(false);
    });
});

describe('dry run', () => {

    it('should not execute the commands in dry run mode when there is no dry run file', () => {
        const commandQueue = new CommandQueue({
            workingDirectory: '.',
            dryRun: true,
        });
        commandQueue.add('echo "Hello"').add('echo "World"').run();
        expect(commandQueue.results.length).toBe(2);
        expect(commandQueue.results[0].out).toBe('');
        expect(commandQueue.results[1].out).toBe('');
    });

    it('should execute the commands in dry run mode when there is a dry run file', () => {
        const spawnSyncSpy = jest.spyOn(child_process, 'spawnSync')

        // Write out the results to a file
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(),'command-queue-test-'));
        const tempFileName = 'commands.json';
        const tempFilePath = `${tempDir}/${tempFileName}`;    
        q({
            workingDirectory: '.',
            dryRunResultsFile: tempFilePath,
        }).add('echo "Hello"').add('echo "World"').run();

        // Now run the commands in dry run mode
        spawnSyncSpy.mockClear()
        const commandQueue = q({
            workingDirectory: '.',
            dryRun: true,
            dryRunResultsFile: tempFilePath,
        });
        commandQueue.add('echo "Hello"').add('echo "World"').run();
        expect(commandQueue.results.length).toBe(2);
        expect(commandQueue.results[0].out).toBe('Hello\n');
        expect(commandQueue.results[1].out).toBe('World\n');
        expect(spawnSyncSpy).toHaveBeenCalledTimes(0);
    });
})