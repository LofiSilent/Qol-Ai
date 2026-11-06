"""Процедурные текстуры для аватара (numpy -> PNG)."""
import numpy as np, os
from PIL import Image

OUT = '/tmp/claude-0/-home-user/fc9170e7-9132-505f-a76b-6fc8971ea952/scratchpad/tex'
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def blur1d(a, k, axis):
    k = int(k)
    if k < 2:
        return a
    ker = np.ones(k) / k
    return np.apply_along_axis(lambda m: np.convolve(np.pad(m, (k // 2, k - 1 - k // 2), mode='wrap'), ker, mode='valid'), axis, a)


def norm(a):
    return (a - a.min()) / (a.max() - a.min() + 1e-9)


def save(name, arr):
    arr = np.clip(arr, 0, 1)
    Image.fromarray((arr * 255).astype(np.uint8)).save(f'{OUT}/{name}.png')


def normal_from_height(h, strength):
    dx = np.roll(h, -1, 1) - np.roll(h, 1, 1)
    dy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
    nx, ny, nz = -dx * strength, dy * strength, np.ones_like(h)
    l = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    return np.stack([nx / l * .5 + .5, ny / l * .5 + .5, nz / l * .5 + .5], -1)


def hair(size=1024):
    """Волос: вертикальные пряди (v вдоль длины). Возвращает цвет, нормаль."""
    H = W = size
    # пряди разной ширины: шум по u, вытянутый по v
    s1 = blur1d(rng.random((H, W)), 3, 1)
    for k in (1,):
        s1 = blur1d(s1, 90, 0)               # очень длинные по v
    s2 = blur1d(blur1d(rng.random((H, W)), 2, 1), 40, 0)
    s3 = blur1d(blur1d(rng.random((H, W)), 5, 1), 160, 0)
    streak = norm(.55 * norm(s1) + .3 * norm(s2) + .15 * norm(s3))
    fine = norm(blur1d(rng.random((H, W)), 2, 1))
    h = .7 * streak + .3 * fine
    # цвет: тёмно-каштановый с мягкими бликами в светлых прядях
    dark = np.array([.010, .006, .004]); mid = np.array([.026, .015, .0095]); light = np.array([.085, .052, .031])
    t = norm(streak)[..., None]
    col = dark * (1 - t) + mid * t
    hl = np.clip((t - .72) / .28, 0, 1) ** 1.6
    col = col * (1 - hl) + light * hl
    # лёгкое осветление к концам (v->0 — низ), тёмные корни сверху
    v = np.linspace(1, 0, H)[:, None, None]
    col = col * (.82 + .35 * (1 - v) ** 1.5)
    col *= (.9 + .2 * fine[..., None])
    save('hair_color', np.clip(col, 0, 1) ** (1 / 2.2) * 1.0)   # sRGB
    save('hair_normal', normal_from_height(h, 5.0))
    return h


def fabric(name, base, weave=96, size=1024, twill=True, strength=3.0):
    """Шерстяная ткань: диагональное саржевое плетение + шум."""
    H = W = size
    y, x = np.mgrid[0:H, 0:W] / size
    if twill:
        t = np.sin((x + y) * np.pi * 2 * weave) * .5 + .5
        t2 = np.sin((x - y) * np.pi * 2 * weave * .5) * .5 + .5
        h = .6 * t + .25 * t2
    else:
        h = np.sin(x * np.pi * 2 * weave) * np.sin(y * np.pi * 2 * weave) * .5 + .5
    h = .75 * h + .25 * rng.random((H, W))
    h = norm(blur1d(blur1d(h, 2, 0), 2, 1))
    base = np.array(base)
    col = base[None, None, :] * (.88 + .24 * h[..., None])
    save(f'{name}_color', np.clip(col, 0, 1) ** (1 / 2.2))
    save(f'{name}_normal', normal_from_height(h, strength))


def iris(size=1024):
    """Радужка: радиальные волокна, лимбальное кольцо, зрачок."""
    c = size / 2
    y, x = np.mgrid[0:size, 0:size]
    dx, dy = (x - c) / c, (y - c) / c
    r = np.sqrt(dx ** 2 + dy ** 2)
    a = np.arctan2(dy, dx)
    fib = norm(blur1d(rng.random((size, 720)), 3, 1))
    ang_idx = ((a + np.pi) / (2 * np.pi) * 719).astype(int) % 720
    rad_idx = np.clip((r * size / 2).astype(int), 0, size - 1)
    fibers = fib[rad_idx, ang_idx]
    fibers2 = norm(blur1d(rng.random((size, 360)), 5, 1))[rad_idx, (ang_idx // 2) % 360]
    f = .6 * fibers + .4 * fibers2
    base_in = np.array([.16, .085, .03]); base_out = np.array([.07, .035, .014]); gold = np.array([.30, .17, .06])
    t = np.clip((r - .25) / .45, 0, 1)[..., None]
    col = base_in * (1 - t) + base_out * t
    col = col * (.65 + .7 * f[..., None]) + gold * (np.clip(1 - np.abs(r - .38) / .18, 0, 1) ** 2 * f)[..., None] * .35
    # лимбальное кольцо (тёмное по краю), зрачок
    limb = np.clip((r - .72) / .2, 0, 1)[..., None]
    col = col * (1 - limb * .85)
    pupil = (r < .27)
    col[pupil] = [.005, .004, .004]
    col[r > 1] = [.012, .008, .006]
    save('iris_color', np.clip(col, 0, 1) ** (1 / 2.2))


def skin_detail(size=1024):
    """Микрорельеф кожи (поры, едва заметный) — для нормалей головы/тела."""
    H = W = size
    n1 = rng.random((H, W)); n2 = blur1d(blur1d(rng.random((H, W)), 3, 0), 3, 1)
    h = norm(.5 * n1 + .5 * norm(n2))
    save('skin_normal', normal_from_height(h, 1.6))


if __name__ == '__main__':
    hair(); iris(); skin_detail()
    fabric('wool', (.0085, .013, .026), weave=110, size=512)       # тёмно-синий шерстяной пиджак
    fabric('blouse', (.40, .385, .35), weave=140, twill=False, strength=1.6, size=512)  # слоновая кость
    fabric('trousers', (.007, .010, .021), weave=110, size=512)
    print('textures ready', os.listdir(OUT))
