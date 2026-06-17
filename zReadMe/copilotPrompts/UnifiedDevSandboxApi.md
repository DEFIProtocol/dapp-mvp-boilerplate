Act as a Principal Systems Architect. We are going to design a local Unified Developer Sandbox Gateway using a Reverse Proxy/Aggregator pattern. We are operating in Plan Mode. Do not write any implementation code yet. Present your structural plan and ask your clarifying questions first.

### Objective
Allow external developers to contribute to the project using a single, unified sandbox API key, shielding them from needing to manage 10+ separate external downstream API keys, and keeping our production/testnet master keys entirely hidden and secure.

### Core Requirements
1. **The Gateway Router:** Design an internal gateway router that intercepts incoming developer requests. It must validate a single header format (e.g., `Authorization: Bearer IR_SANDBOX_DEV_KEY_XYZ`).
2. **Master Key Encapsulation:** The actual master production/testnet API keys for our 10 downstream external dependencies must live strictly as backend environment variables on our server. They must never be exposed to the developer client.
3. **Request Aggregation & Proxying:** When a developer hits our unified sandbox endpoint (e.g., `/api/v1/sandbox/market-data`), the gateway must:
   - Authenticate the developer's sandbox key.
   - Map their single request to the necessary downstream external API endpoints.
   - Inject our secret master keys into those external requests safely on the backend.
   - Aggregate/clean the payloads from those external services into a clean, unified JSON structure and return it to the developer.
4. **Rate Limiting & Security:** Include a strategy for rate-limiting the sandbox keys to prevent a single developer's loop from exhausting our master API limits.

### Rules for Your Plan
- Outline the request/response flow diagram in text.
- Explain how you will handle error mappings (e.g., if one of the 10 external downstream APIs fails, how does our sandbox safely report that without crashing?).
- Detail the layout of the config file managing the downstream API routes.

Please analyze this architecture, present your step-by-step execution plan, and ask me your clarifying questions.


[External Dev] ───> [ 1 Unified Key ] ───> [ Secure Guard Shack ]
                                                    │ (Your Master Keys)
                                                    ▼
                                          [ 10 External APIs ]