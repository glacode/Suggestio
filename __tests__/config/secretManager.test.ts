
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SecretManager } from '../../src/config/secretManager.js';
import { createMockWindowProvider } from '../testUtils.js';
import { ISecretStorage } from '../../src/types.js';

describe('SecretManager', () => {
    let secretManager: SecretManager;
    let mockSecrets: jest.Mocked<ISecretStorage>;
    let mockWindowProvider: ReturnType<typeof createMockWindowProvider>;

    beforeEach(() => {
        mockSecrets = {
            get: jest.fn<() => Promise<string | undefined>>(),
            store: jest.fn<() => Promise<void>>(),
            delete: jest.fn<() => Promise<void>>(),
        };
        mockWindowProvider = createMockWindowProvider();
        secretManager = new SecretManager(mockSecrets, mockWindowProvider);
    });

    it('should get a secret', async () => {
        mockSecrets.get.mockResolvedValue('my-secret');
        const secret = await secretManager.getSecret('my-key');
        expect(secret).toBe('my-secret');
        expect(mockSecrets.get).toHaveBeenCalledWith('my-key');
    });

    it('should store a secret', async () => {
        await secretManager.storeSecret('my-key', 'my-secret');
        expect(mockSecrets.store).toHaveBeenCalledWith('my-key', 'my-secret');
    });

    it('should delete a secret', async () => {
        await secretManager.deleteSecret('my-key');
        expect(mockSecrets.delete).toHaveBeenCalledWith('my-key');
    });

    it('should update API key', async () => {
        mockWindowProvider.showInputBox.mockResolvedValue('new-key');
        await secretManager.updateAPIKey('my-key');
        expect(mockSecrets.store).toHaveBeenCalledWith('my-key', 'new-key');
        expect(mockWindowProvider.showInformationMessage).toHaveBeenCalledWith('API key for my-key updated.');
    });

    it('should not update API key if input is empty', async () => {
        mockWindowProvider.showInputBox.mockResolvedValue('');
        await secretManager.updateAPIKey('my-key');
        expect(mockSecrets.store).not.toHaveBeenCalled();
    });

    it('should get or request API key (existing)', async () => {
        mockSecrets.get.mockResolvedValue('existing-key');
        const key = await secretManager.getOrRequestAPIKey('my-key');
        expect(key).toBe('existing-key');
        expect(mockWindowProvider.showInputBox).not.toHaveBeenCalled();
    });

    it('should get or request API key (requesting)', async () => {
        mockSecrets.get.mockResolvedValue(undefined);
        mockWindowProvider.showInputBox.mockResolvedValue('user-key');
        const key = await secretManager.getOrRequestAPIKey('my-key');
        expect(key).toBe('user-key');
        expect(mockSecrets.store).toHaveBeenCalledWith('my-key', 'user-key');
    });

    it('should throw error if API key is not provided', async () => {
        mockSecrets.get.mockResolvedValue(undefined);
        mockWindowProvider.showInputBox.mockResolvedValue(undefined);
        await expect(secretManager.getOrRequestAPIKey('my-key')).rejects.toThrow('API key for my-key is required');
    });
});
