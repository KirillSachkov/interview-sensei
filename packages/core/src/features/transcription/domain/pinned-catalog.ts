// The pinned components of speech recognition. A new version changes its URLs, SHA-256 and sizes
// here together with `version`, so an installed older version downloads again. The SHA-256 of
// npm tarballs, release assets and Hugging Face files were checked by download on 2026-11-10
// (docs: spec-74 findings).
import type { Component, ComponentCatalog, ComponentFile } from "./components.ts";

const sherpaVersion = "2.0.1";
const npm = "https://registry.npmjs.org";

/** The platforms the application recognizes speech on: `<process.platform>-<process.arch>`. */
type Platform = "darwin-arm64" | "darwin-x64" | "linux-x64" | "linux-arm64" | "win32-x64";

/** The platform package of sherpa-onnx-node: its name names `win` instead of `win32`. */
const sherpaPackages: Readonly<Record<Platform, { name: string; sha256: string; size: number }>> = {
  "darwin-arm64": {
    name: "sherpa-onnx-darwin-arm64",
    sha256: "afc9415260e232c4dadc25a29a8645acb0ba06ef989060d32274f4c749a4830e",
    size: 10_013_200,
  },
  "darwin-x64": {
    name: "sherpa-onnx-darwin-x64",
    sha256: "e95e4addd3d02919ae61f311effd6e5349e00b50985c4a8c9a3bcb03dc6d6325",
    size: 11_167_483,
  },
  "linux-x64": {
    name: "sherpa-onnx-linux-x64",
    sha256: "08c6fe2b65838febbd0c260aaa9991990d2d592e503e758bfd2f5db6cbc79338",
    size: 11_005_484,
  },
  "linux-arm64": {
    name: "sherpa-onnx-linux-arm64",
    sha256: "b8f18ee34c8e14bbafb7f51332361a6ab91f4ddbb4a4eac58f74ec0dafb39e87",
    size: 13_822_449,
  },
  "win32-x64": {
    name: "sherpa-onnx-win-x64",
    sha256: "217cec234c6026dbfd2b9c06523507180796fe4227c7cc9d11cfe218260a2519",
    size: 8_779_375,
  },
};

/** The ffmpeg-static b6.1.1 binaries, gzipped, from the package's GitHub release. */
const ffmpegBuilds: Readonly<Record<Platform, { asset: string; sha256: string; size: number }>> = {
  "darwin-arm64": {
    asset: "ffmpeg-darwin-arm64.gz",
    sha256: "8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa",
    size: 19_246_198,
  },
  "darwin-x64": {
    asset: "ffmpeg-darwin-x64.gz",
    sha256: "929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106",
    size: 25_296_431,
  },
  "linux-x64": {
    asset: "ffmpeg-linux-x64.gz",
    sha256: "bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa",
    size: 29_354_986,
  },
  "linux-arm64": {
    asset: "ffmpeg-linux-arm64.gz",
    sha256: "754a678672298bc68156adff58aa7385a592c2b30b1d0ae8750c45c915c4bac0",
    size: 25_568_691,
  },
  "win32-x64": {
    asset: "ffmpeg-win32-x64.gz",
    sha256: "8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77",
    size: 29_581_307,
  },
};

const ytDlpVersion = "2026.10.26";

/**
 * The yt-dlp builds of a release, each a zip of a directory with the program and `_internal`. The
 * directory build starts in a fraction of a second; the one-file build unpacks itself on every run,
 * which takes about 7 seconds on macOS. The macOS build is universal.
 */
const ytDlpBuilds: Readonly<
  Record<Platform, { asset: string; program: string; sha256: string; size: number }>
> = {
  "darwin-arm64": {
    asset: "yt-dlp_macos.zip",
    program: "yt-dlp_macos",
    sha256: "20d98fa608998eff87d1d35a6e9fb65e4b874639a6cc89addc19da3becde3ef1",
    size: 54_165_284,
  },
  "darwin-x64": {
    asset: "yt-dlp_macos.zip",
    program: "yt-dlp_macos",
    sha256: "20d98fa608998eff87d1d35a6e9fb65e4b874639a6cc89addc19da3becde3ef1",
    size: 54_165_284,
  },
  "linux-x64": {
    asset: "yt-dlp_linux.zip",
    program: "yt-dlp_linux",
    sha256: "f34053415136e55073dd64ba5326d161ecc23ce0e98c081d8752867b37809450",
    size: 41_236_547,
  },
  "linux-arm64": {
    asset: "yt-dlp_linux_aarch64.zip",
    program: "yt-dlp_linux_aarch64",
    sha256: "74708e707e8fa8177c8347e58152337edf320149cd7b225defd453f7cde47822",
    size: 40_835_009,
  },
  "win32-x64": {
    asset: "yt-dlp_win.zip",
    program: "yt-dlp.exe",
    sha256: "fd51b212cf8380c7a52ee08c0d6be7f3c59b2f2c832eaf7b45acfae6eab57419",
    size: 23_885_596,
  },
};

function isPlatform(platform: string): platform is Platform {
  return Object.hasOwn(sherpaPackages, platform);
}

function engine(platform: Platform): Component {
  const native = sherpaPackages[platform];
  return {
    id: "engine",
    version: `sherpa-onnx-${sherpaVersion}`,
    files: [
      {
        url: `${npm}/sherpa-onnx-node/-/sherpa-onnx-node-${sherpaVersion}.tgz`,
        sha256: "06ef8dfb9ea0f3cc77c1866620cbe05bf11b7dd70a973a454b77ce4a66cbcee1",
        size: 12_709,
        path: "node_modules/sherpa-onnx-node",
        unpack: "npm-package",
      },
      {
        url: `${npm}/${native.name}/-/${native.name}-${sherpaVersion}.tgz`,
        sha256: native.sha256,
        size: native.size,
        path: `node_modules/${native.name}`,
        unpack: "npm-package",
      },
    ],
  };
}

function ffmpeg(platform: Platform): Component {
  const build = ffmpegBuilds[platform];
  return {
    id: "ffmpeg",
    version: "ffmpeg-static-b6.1.1",
    files: [
      {
        url: `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/${build.asset}`,
        sha256: build.sha256,
        size: build.size,
        path: platform === "win32-x64" ? "ffmpeg.exe" : "ffmpeg",
        unpack: "gunzip",
        executable: true,
      },
    ],
  };
}

/** The directory of the yt-dlp build inside its component's directory. */
const ytDlpDirectory = "yt-dlp";

function ytDlp(platform: Platform): Component {
  const build = ytDlpBuilds[platform];
  return {
    id: "yt-dlp",
    version: `yt-dlp-${ytDlpVersion}`,
    files: [
      {
        url: `https://github.com/yt-dlp/yt-dlp/releases/download/${ytDlpVersion}/${build.asset}`,
        sha256: build.sha256,
        size: build.size,
        path: ytDlpDirectory,
        unpack: "zip",
        executable: true,
      },
    ],
  };
}

/**
 * The yt-dlp program inside its component's directory, with `/` between parts; null where the
 * application does not read links to videos.
 */
export function ytDlpProgram(platform: string): string | null {
  return isPlatform(platform) ? `${ytDlpDirectory}/${ytDlpBuilds[platform].program}` : null;
}

const vad: Component = {
  id: "vad",
  version: "silero-vad-asr-models",
  files: [
    {
      url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx",
      sha256: "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6",
      size: 643_854,
      path: "silero_vad.onnx",
      unpack: "none",
    },
  ],
};

/** A file of a Hugging Face repository at a pinned commit. */
function huggingFace(
  repository: string,
  commit: string,
  { name, sha256, size }: { name: string; sha256: string; size: number },
): ComponentFile {
  return {
    url: `https://huggingface.co/${repository}/resolve/${commit}/${name}`,
    sha256,
    size,
    path: name,
    unpack: "none",
  };
}

const gigaamRepository =
  "csukuangfj/sherpa-onnx-nemo-transducer-punct-giga-am-v3-russian-2025-12-16";
const gigaamCommit = "a6039be7cee829a9044a69ac0ebaf1c191217c97";

/** GigaAM v3 RNN-T with punctuation, int8 encoder: the files of the sherpa-onnx export. */
const gigaam: Component = {
  id: "gigaam-v3",
  version: `${gigaamRepository}@${gigaamCommit}`,
  files: [
    {
      name: "encoder.int8.onnx",
      sha256: "369f35a71bf288d3b8e0391fabd8dba5f2314088d440bca474056b7b4b6e66bf",
      size: 224_570_820,
    },
    {
      name: "decoder.onnx",
      sha256: "38fc7475443ea2a26f63211ca350f73ac50fff824ab7a3876ee2bd610c53bbc4",
      size: 4_600_132,
    },
    {
      name: "joiner.onnx",
      sha256: "602ff7017a93311aad34df1437c8d7f49911353c13d6eae7a6ee7b041339465c",
      size: 2_712_896,
    },
    {
      name: "tokens.txt",
      sha256: "39abae20e692998290c574e606f11a9edef2902a1995463fcff63d1490cf22b7",
      size: 13_354,
    },
  ].map((file) => huggingFace(gigaamRepository, gigaamCommit, file)),
};

const parakeetRepository = "csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8";
const parakeetCommit = "ed5d745623472f97cfc2e6c2916ee248798fc5a8";

/** Parakeet TDT 0.6B v3, int8: the files of the sherpa-onnx export. */
const parakeet: Component = {
  id: "parakeet-v3",
  version: `${parakeetRepository}@${parakeetCommit}`,
  files: [
    {
      name: "encoder.int8.onnx",
      sha256: "1afbe69c1ffdabee94755f42e4daf1d93549131a3da11356bda84fcef0f2c479",
      size: 652_282_294,
    },
    {
      name: "decoder.int8.onnx",
      sha256: "0222a86147299d4dee90edf95b6d13827edb42ad8b7c9cf0b2582f030937c0b5",
      size: 11_845_274,
    },
    {
      name: "joiner.int8.onnx",
      sha256: "cbd02f3696e9944970111fb439d9c3fd365a80374565f13f2b9c7007d253fc98",
      size: 6_355_277,
    },
    {
      name: "tokens.txt",
      sha256: "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d",
      size: 93_939,
    },
  ].map((file) => huggingFace(parakeetRepository, parakeetCommit, file)),
};

/** The pinned components of the platform; null where the application does not recognize speech. */
export function pinnedCatalog(platform: string): ComponentCatalog | null {
  if (!isPlatform(platform)) {
    return null;
  }
  return {
    shared: [engine(platform), ffmpeg(platform), vad],
    ytDlp: ytDlp(platform),
    models: { "gigaam-v3": gigaam, "parakeet-v3": parakeet },
  };
}
