"""CI-only NVDA speech observation for the owned, credential-free desktop window.

Loaded only from the temporary NVDA scratchpad, never bundled with the product.
The observer does not synthesize expected labels or change NVDA's speech sequence.
"""

import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path

import api
import buildVersion
import globalPluginHandler
from speech.extensions import pre_speech


class GlobalPlugin(globalPluginHandler.GlobalPlugin):
    def __init__(self):
        super().__init__()
        self.path = Path(os.environ["FBFC_A11Y_CAPTURE"])
        self.window = int(os.environ["FBFC_A11Y_WINDOW"])
        self.count = 0
        self.ancestor = ctypes.windll.user32.GetAncestor
        self.ancestor.argtypes = (wintypes.HWND, wintypes.UINT)
        self.ancestor.restype = wintypes.HWND
        pre_speech.register(self.observe)
        self.write({"ready": True, "nvdaVersion": buildVersion.version})

    def write(self, value):
        if self.count >= 256:
            return
        with self.path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(value, ensure_ascii=True) + "\n")
        self.count += 1

    def observe(self, speechSequence, **kwargs):
        obj = api.getFocusObject()
        if not obj or not obj.windowHandle:
            return
        if self.ancestor(obj.windowHandle, 2) != self.window:
            return
        # Capture only NVDA-generated text for this window, never command objects.
        text = " ".join(part for part in speechSequence if isinstance(part, str))[:2048]
        if text.strip():
            self.write({"text": text})

    def terminate(self):
        pre_speech.unregister(self.observe)
        super().terminate()
