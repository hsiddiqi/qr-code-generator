import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import QRCode from 'qrcode';
import { buildQrPayload } from './payloadBuilders';
import { QrProject } from './types';

type ExportFormat = 'png' | 'svg' | 'pdf';

const sanitizeFileName = (name: string) => name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'qr-code';

const dataUrlToBase64 = (dataUrl: string) => dataUrl.replace(/^data:image\/png;base64,/, '');

const injectLogoIntoSvg = (svg: string, project: QrProject) => {
  if (!project.logoUri) {
    return svg;
  }

  const logoSize = Math.round(project.size * 0.22);
  const logoOffset = Math.round((project.size - logoSize) / 2);
  const href = project.logoUri;
  const imageTag = `<rect x="${logoOffset - 8}" y="${logoOffset - 8}" width="${logoSize + 16}" height="${logoSize + 16}" rx="12" fill="${project.background}"/><image href="${href}" x="${logoOffset}" y="${logoOffset}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`;
  return svg.replace('</svg>', `${imageTag}</svg>`);
};

const writeString = async (uri: string, contents: string, encoding?: FileSystem.EncodingType) => {
  await FileSystem.writeAsStringAsync(uri, contents, encoding ? { encoding } : undefined);
  return uri;
};

const shareFile = async (uri: string) => {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri);
  }
  return uri;
};

export const exportPngBase64 = async (project: QrProject, base64: string) => {
  const baseName = sanitizeFileName(project.name);
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  const uri = `${dir}${baseName}.png`;
  await writeString(uri, base64, FileSystem.EncodingType.Base64);
  return shareFile(uri);
};

export const exportProject = async (project: QrProject, format: ExportFormat) => {
  const payload = buildQrPayload(project);
  const baseName = sanitizeFileName(project.name);
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';

  if (format === 'png') {
    const dataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: project.errorCorrection,
      margin: 2,
      scale: 8,
      color: { dark: project.foreground, light: project.background },
      width: project.size,
    });
    const uri = `${dir}${baseName}.png`;
    await writeString(uri, dataUrlToBase64(dataUrl), FileSystem.EncodingType.Base64);
    return shareFile(uri);
  }

  const svg = await QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: project.errorCorrection,
    margin: 2,
    color: { dark: project.foreground, light: project.background },
    width: project.size,
  });
  const svgWithLogo = injectLogoIntoSvg(svg, project);

  if (format === 'svg') {
    const uri = `${dir}${baseName}.svg`;
    await writeString(uri, svgWithLogo);
    return shareFile(uri);
  }

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 32px; color: #101820; }
          .sheet { display: flex; flex-direction: column; align-items: center; gap: 18px; }
          h1 { font-size: 24px; margin: 0; }
          p { margin: 0; color: #5a6472; }
          .qr { width: ${project.size}px; max-width: 100%; }
        </style>
      </head>
      <body>
        <div class="sheet">
          <h1>${project.name}</h1>
          <div class="qr">${svgWithLogo}</div>
          <p>${project.category}</p>
        </div>
      </body>
    </html>
  `;
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return shareFile(uri);
};
