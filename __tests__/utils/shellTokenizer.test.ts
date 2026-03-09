import { describe, it, expect } from "@jest/globals";
import { ShellTokenizer } from '../../src/utils/shellTokenizer.js';

describe('ShellTokenizer', () => {
    it('should tokenize simple commands', () => {
        expect(ShellTokenizer.tokenize('ls -la')).toEqual(['ls', '-la']);
        expect(ShellTokenizer.tokenize('npm test')).toEqual(['npm', 'test']);
    });

    it('should handle multiple spaces', () => {
        expect(ShellTokenizer.tokenize('ls    -la  src')).toEqual(['ls', '-la', 'src']);
    });

    it('should handle single quotes', () => {
        expect(ShellTokenizer.tokenize("grep 'hello world' file.txt")).toEqual(['grep', 'hello world', 'file.txt']);
    });

    it('should handle double quotes', () => {
        expect(ShellTokenizer.tokenize('grep "hello world" file.txt')).toEqual(['grep', 'hello world', 'file.txt']);
    });

    it('should handle escaped spaces', () => {
        expect(ShellTokenizer.tokenize('ls My\\ Documents')).toEqual(['ls', 'My Documents']);
    });

    it('should handle command separators', () => {
        expect(ShellTokenizer.tokenize('ls; rm -rf /')).toEqual(['ls', ';', 'rm', '-rf', '/']);
        expect(ShellTokenizer.tokenize('npm install && npm test')).toEqual(['npm', 'install', '&&', 'npm', 'test']);
        expect(ShellTokenizer.tokenize('cmd1 || cmd2')).toEqual(['cmd1', '||', 'cmd2']);
    });

    it('should handle pipes and redirections', () => {
        expect(ShellTokenizer.tokenize('cat file.txt | grep hello > output.txt')).toEqual(['cat', 'file.txt', '|', 'grep', 'hello', '>', 'output.txt']);
    });

    it('should handle complex combinations', () => {
        const cmd = 'sudo rm -rf "/usr/local/bin" && echo "done; really"';
        const expected = ['sudo', 'rm', '-rf', '/usr/local/bin', '&&', 'echo', 'done; really'];
        expect(ShellTokenizer.tokenize(cmd)).toEqual(expected);
    });

    it('should handle empty input', () => {
        expect(ShellTokenizer.tokenize('')).toEqual([]);
        expect(ShellTokenizer.tokenize('   ')).toEqual([]);
    });

    it('should handle nested-like quotes (quotes within words)', () => {
        expect(ShellTokenizer.tokenize('echo "prefix"suffix')).toEqual(['echo', 'prefixsuffix']);
        expect(ShellTokenizer.tokenize('echo prefix"suffix"')).toEqual(['echo', 'prefixsuffix']);
    });
});
