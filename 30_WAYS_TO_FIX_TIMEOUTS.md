# 30+ Advanced Fixes for Playwright `net::ERR_TIMED_OUT`

Based on deep research into 2026 anti-bot and network optimization strategies, here are 30+ ways to resolve critical navigation timeouts.

## 1. Browser & Context Level (Layers 1-10)
1.  **Extended Navigation Timeout**: Increase `page.goto` timeout to 120,000ms (2 minutes).
2.  **Extended Action Timeout**: Increase `page.setDefaultTimeout` to 60,000ms.
3.  **Multiple `waitUntil` Fallbacks**: Try `domcontentloaded` first, then `load`, then `networkidle` as a last resort.
4.  **Disable Service Workers**: Use `--disable-service-workers` flag to prevent background network interference.
5.  **Disable GPU**: Use `--disable-gpu` for better stability in headless Linux environments.
6.  **Shared Memory Increase**: Use `--disable-dev-shm-usage` to prevent crashes on resource-constrained servers.
7.  **DNS Over HTTPS**: Configure custom DNS to bypass local ISP throttling or blocks.
8.  **Ignore HTTPSErrors**: Set `ignoreHTTPSErrors: true` in context to prevent hang-ups on certificate issues.
9.  **Blink Features Masking**: Use `--disable-blink-features=AutomationControlled` (Essential).
10. **Site Isolation**: Disable with `--disable-features=IsolateOrigins,site-per-process`.

## 2. Advanced Stealth Patches (Layers 11-20)
11. **Navigator.webdriver**: Set to `undefined` (not `false`) via `addInitScript`.
12. **Chrome Runtime Patch**: Mock `window.chrome.runtime`, `loadTimes`, and `csi`.
13. **WebGL Fingerprint**: Mask `UNMASKED_VENDOR_WEBGL` and `UNMASKED_RENDERER_WEBGL` to "Intel Inc.".
14. **Plugin Enumeration**: Mock `navigator.plugins` and `navigator.mimeTypes` to look like a real browser.
15. **Permissions Query**: Patch `navigator.permissions.query` to handle 'notifications' correctly.
16. **Iframe Isolation**: Patch `contentWindow` of dynamically created iframes to maintain stealth.
17. **Hardware Concurrency**: Randomize `navigator.hardwareConcurrency` between 4 and 8.
18. **Device Memory**: Mock `navigator.deviceMemory` to 8GB.
19. **Battery API**: Mock `navigator.getBattery()` to return a realistic charging state.
20. **Canvas Fingerprinting**: Add slight noise to canvas `toDataURL` to prevent tracking.

## 3. Network & Proxy Optimization (Layers 21-25)
21. **Proxy Rotation**: Use a new proxy for every single retry attempt.
22. **Proxy Health Check**: Pre-verify proxies before using them in Playwright.
23. **Network Interception**: Block unnecessary resources (images, fonts, CSS) to speed up `load` events.
24. **Bypass Service Workers**: Use `bypassServiceWorker: true` in context options.
25. **Custom Headers**: Ensure `Accept-Language`, `Referer`, and `Sec-Fetch-*` headers match the User-Agent.

## 4. Interaction & Behavior (Layers 26-30+)
26. **Human-Like Typing**: Use `delay` between 50ms and 150ms for typing.
27. **Random Mouse Jitter**: Move the mouse randomly before clicking.
28. **Scroll Before Action**: Scroll the page slightly to trigger lazy-loaded elements.
29. **Wait for Network Idle**: Manually check `page.waitForLoadState('networkidle')` after interactions.
30. **Smart Wait for Selectors**: Use `waitForSelector` with short timeouts in a loop instead of one long wait.
31. **Visual State Verification**: Take a screenshot and use pixel analysis if selectors fail.
32. **Cookie Persistence**: Reuse valid session cookies if available to bypass the login page entirely.
