package org.fitconnect.integration.v2;

import dev.fitko.fitconnect.core.io.FileChunker;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

/** Keep SDK3's merge output distinct from its fragment inputs, regardless of the original name. */
final class IncomingFileChunker extends FileChunker {
    @Override
    public Optional<File> concatChunks(Path path, String fileName) throws IOException {
        // SDK3 separately preserves the original metadata filename in AttachmentMapper.
        // A fresh .bin file cannot enter its snapshot of files containing ".chunk".
        Path output = Files.createTempFile(path, "merged-", ".bin");
        boolean retained = false;
        try {
            Optional<File> result = super.concatChunks(path, output.getFileName().toString());
            retained = result.isPresent();
            return result;
        } finally {
            if (!retained) Files.deleteIfExists(output);
        }
    }
}
