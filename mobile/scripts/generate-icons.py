"""Gera ícones/splash do app a partir de assets/brand/logo-source.png.

Uso: python3 scripts/generate-icons.py  (requer Pillow)

A logo atual tem só 191x185 px — os ícones gerados ficam aceitáveis, mas
substitua assets/brand/logo-source.png por uma versão >= 1024 px (ou vetor
exportado) antes da publicação final e rode o script de novo.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
NAVY = (10, 23, 38, 255)  # --color-navy do hub

logo = Image.open(ASSETS / "brand" / "logo-source.png").convert("RGBA")
logo = logo.crop(logo.getbbox())


def fit(img: Image.Image, box: int) -> Image.Image:
    scale = box / max(img.size)
    return img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)


def centered(canvas: Image.Image, img: Image.Image) -> Image.Image:
    x = (canvas.width - img.width) // 2
    y = (canvas.height - img.height) // 2
    canvas.alpha_composite(img, (x, y))
    return canvas


# iOS/App Store: 1024x1024, opaco (a Apple rejeita ícone com transparência).
icon = centered(Image.new("RGBA", (1024, 1024), NAVY), fit(logo, 640))
icon.convert("RGB").save(ASSETS / "icon.png")

# Android adaptive: foreground dentro da safe zone (~66% central).
fg = centered(Image.new("RGBA", (1024, 1024), (0, 0, 0, 0)), fit(logo, 560))
fg.save(ASSETS / "android-icon-foreground.png")
Image.new("RGBA", (1024, 1024), NAVY).save(ASSETS / "android-icon-background.png")

# Monocromático (Android 13+ themed icons): silhueta branca a partir do alpha.
alpha = fg.getchannel("A")
mono = Image.new("RGBA", fg.size, (255, 255, 255, 0))
mono.putalpha(alpha)
mono.save(ASSETS / "android-icon-monochrome.png")

# Splash: logo sobre fundo transparente (a cor de fundo vem do app.config).
centered(Image.new("RGBA", (1024, 1024), (0, 0, 0, 0)), fit(logo, 900)).save(ASSETS / "splash-icon.png")

# Favicon (web/expo) e logo usada dentro do app.
icon.resize((48, 48), Image.LANCZOS).convert("RGB").save(ASSETS / "favicon.png")
fit(logo, 512).save(ASSETS / "brand" / "logo.png")
print("ok")
