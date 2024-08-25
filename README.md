# CmdQ

CmdQ is a chained command queue for typescript.  It allows for the chaining of commands and the execution of those commands in a sequential order.  Additionally, with easy to use hooks, you can apply custom logic to conditionally execute commands and also mutate output from previous commands using typescript.  Through a mix of shell commands and typescript, you can create powerful command queues that can be used in a variety of applications.

## Installation

```bash
npm install @kshehadeh/cmdq
```

## Usage

### Simple Example

```typescript
import { q } from 'cmdq';

q()
  .cmd('echo "Hello World"')  
  .run();

// Output: Hello World
```

### Chaining

```typescript
import { q } from 'cmdq';

q()
  .cmd('echo "Hello World"')
  .cmd('echo "Goodbye World"')
  .run();

// Output: Hello World
//         Goodbye World
```

### Conditional Execution

```typescript
import { q } from 'cmdq';

q()
  .cmd('echo "Hello World"', {
    pre: () => false
  })
  .cmd('echo "Goodbye World"')
  .run();

// Output: Goodbye World
```

### Mutating Output

```typescript
import { q } from 'cmdq';

q()
  .cmd('echo "Hello World"', {
    post: (result) => {
      result.out = 'Goodbye World';
      return result;
    }
  })
  .run();

// Output: Goodbye World
```

### Piping Output

```typescript
import { q } from 'cmdq';

q()
  .cmd('echo "Hello World"')
  .pipe('wc -w')
  .run();

// Output: 2
```

Note: If you a command is to be piped to but the target command is skipped, the previous command will not be run.

Note: You can chain multiple commands to be piped to by calling `pipe` multiple times.  For example:

```typescript
import { q } from 'cmdq';

q()
  .cmd('echo "{ \"name\": \"John\" }"')
  .pipe('jq .name')
  .pipe('tr -d \'"\'')
  .run();
```

## API

### `q([config])`

Creates a new command queue.

`config`:

- `workingDirectory` - The working directory from which to run the commands.
- `enableTrace` - Outputs information about the commands being run using the configured tracer
- `continueOnError` - If set to true, the command queue will continue to run commands even if a command fails.
- `dryRun` - If set to true, the command queue will not run any commands, but will output the commands that would have been run.
- `dryRunResultsFile` - If set, the command queue will write the results of each command to the specified file.  If `dryRun` is true, then this file will be used as input and any commands that have matching entries in the results file will use the output from that file.

### `q.cmd(command, [options])`

Adds a command to the queue to be executed when `run` is called.

`command` - The command to run.

`options`:

- `continueOnError` - If set to true, the queue will continue to run even if this command fails - ignores the global `continueOnError` setting.
- `pipe` - This can be one of `stdout`, `stderr`, `both` or `none`.  If set, the output of the previous command will be piped to stdin of the current command.
- `pre` - `(result: CommandQueueResult | null) => boolean` - A function that will be called before the command is run.  If the function returns false, the command will be skipped.
- `post` - `(result: CommandQueueResult) => CommandQueueResult` - A function that will be called after the command is run.  The result of the command will be passed to this function and the return value will be used as the result of the command.

### `q.run()`

Runs the command queue in the order that commands were added taking into account any hooks that were set.

### `q.first()`

Runs the first command result in the queue - meant to be used after `run` has been called.

### `q.last()`

Runs the last command result in the queue - meant to be used after `run` has been called.

### `q.results`

An array of the results of each command that was run.

### `r()`

A convenience function that executes a single command and returns the result.  Meant to be used in cases where you don't need to chain commands but want the convenience of the hooks and other features of the command queue.

## Contributing

If you would like to contribute to this project, please open an issue or a pull request.

## License

MIT
