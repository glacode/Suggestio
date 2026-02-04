import { OpenAICompatibleProvider } from "../../src/providers/openAICompatibleProvider.js";
import { SimpleWordAnonymizer } from "../../src/anonymizer/simpleWordAnonymizer.js";
import { UserPrompt } from "../../src/completion/promptBuilder/userPrompt.js";
import { ShannonEntropyCalculator } from "../../src/utils/shannonEntropyCalculator.js";
import * as http from "http";
import { AddressInfo } from "net";
import { NodeFetchClient } from "../../src/utils/httpClient.js";

const entropyCalculator = new ShannonEntropyCalculator();
const httpClient = new NodeFetchClient();

describe("Inline Completion Anonymization", () => {
    let server: http.Server;
    let endpoint: string;
    let lastRequestBody: any;

    beforeAll((done) => {
        server = http.createServer((req, res) => {
            let body = "";
            req.on("data", (chunk) => { body += chunk.toString(); });
            req.on("end", () => {
                lastRequestBody = JSON.parse(body);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ choices: [{ message: { content: "completed code" } }] }));
            });
        });
        server.listen(0, () => {
            const address = server.address() as AddressInfo;
            endpoint = `http://localhost:${address.port}`;
            done();
        });
    });

    afterAll((done) => {
        server.close(done);
    });

    it("should anonymize sensitive words in inline completion prompt", async () => {
        const anonymizer = new SimpleWordAnonymizer(["SECRET_KEY"], entropyCalculator);
        const provider = new OpenAICompatibleProvider({
      httpClient,
      endpoint,
      apiKey: "key",
      model: "model",
      anonymizer,
    });
        
        const promptText = "const api = 'SECRET_KEY';\n// cursor here";
        const prompt = new UserPrompt(promptText);

        await provider.query(prompt);

        expect(lastRequestBody.messages[0].content).not.toContain("SECRET_KEY");
        expect(lastRequestBody.messages[0].content).toContain("ANON_0");
    });

    it("should anonymize high entropy tokens in inline completion prompt", async () => {
        // Entropy anonymization: allowedEntropy=0.8, minLength=10
        const anonymizer = new SimpleWordAnonymizer([], entropyCalculator, 0.8, 10);
        const provider = new OpenAICompatibleProvider({
      httpClient,
      endpoint,
      apiKey: "key",
      model: "model",
      anonymizer,
    });
        
        const highEntropyString = "a1b2c3d4e5f6g7h8i9j0"; // Very high entropy (Hn = 1.0)
        const promptText = `const token = "${highEntropyString}";\n// cursor here`;
        const prompt = new UserPrompt(promptText);

        await provider.query(prompt);

        expect(lastRequestBody.messages[0].content).not.toContain(highEntropyString);
        expect(lastRequestBody.messages[0].content).toContain("ANON_");
    });
});
