import { describe, expect, it } from "vitest";
import {
  createDevtoolsBridge,
  createInPageDevtoolsTransport,
} from "@elfui/devtools-runtime";

import { DevtoolsRpcClient } from "./rpc-client";

describe("DevtoolsRpcClient", () => {
  it("negotiates capabilities and reads snapshots through versioned RPC", async () => {
    const bridge = createDevtoolsBridge();
    const host = document.createElement("elf-rpc-counter");
    const componentId = bridge.registerComponent({
      host,
      tag: "elf-rpc-counter",
      props: () => ({ count: 2 }),
    });
    const client = new DevtoolsRpcClient(
      createInPageDevtoolsTransport(bridge),
      {
        clientName: "rpc-test",
        capabilities: ["component-tree", "component-detail"],
      },
    );

    const handshake = await client.connect();
    expect(handshake).toMatchObject({
      protocolVersion: 1,
      serverName: "@elfui/devtools-runtime",
      negotiatedCapabilities: ["component-tree", "component-detail"],
    });
    expect((await client.getSnapshot()).components).toMatchObject([
      { id: componentId, tag: "elf-rpc-counter" },
    ]);
    expect(await client.getComponentDetail(componentId)).toMatchObject({
      props: {
        kind: "object",
        entries: [{ key: "count", value: { value: 2 } }],
      },
    });
    await expect(client.getTimeline()).rejects.toThrow(
      "capability not negotiated: timeline",
    );
  });

  it("controls timeline recording through RPC", async () => {
    const bridge = createDevtoolsBridge();
    const host = document.createElement("elf-rpc-timeline");
    bridge.registerComponent({ host, tag: "elf-rpc-timeline" });
    const client = new DevtoolsRpcClient(createInPageDevtoolsTransport(bridge));
    await client.connect();

    await client.setTimelinePaused(true);
    bridge.notifyUpdate(host);
    expect((await client.getTimeline()).status).toMatchObject({
      paused: true,
      droppedEvents: 1,
    });

    await client.clearTimeline();
    expect(await client.getTimeline()).toMatchObject({
      status: { paused: true, droppedEvents: 0, aggregatedEvents: 0 },
      events: [],
    });
  });
});
