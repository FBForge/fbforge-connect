package org.fitconnect.integration.host;

import java.io.*;
import java.nio.file.Path;

public final class Main {
    public static void main(String[] args) {
        if (args.length != 0) System.exit(2);
        org.fitconnect.integration.contract.IntegrationEnvironment.current();
        // SDK output must never corrupt the protocol stream or disclose diagnostics to the UI.
        OutputStream protocol = System.out;
        System.setOut(new PrintStream(OutputStream.nullOutputStream()));
        System.setErr(new PrintStream(OutputStream.nullOutputStream()));
        ProcessHandle.current()
                .parent()
                .ifPresent(parent -> parent.onExit().thenRun(() -> System.exit(0)));
        try {
            Path host =
                    Path.of(Main.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            try (var registry = new AdapterRegistry(host.getParent().resolve("adapters"));
                    var engine = new Engine(registry)) {
                String frame;
                while ((frame = FrameCodec.read(System.in)) != null) {
                    FrameCodec.write(protocol, engine.handle(frame));
                    frame = null; // Do not retain a credential-bearing request while waiting for
                    // the next frame.
                }
            }
        } catch (Exception | LinkageError e) {
            System.exit(1);
        }
    }
}
