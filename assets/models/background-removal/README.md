# 内置抠图权重（BEN2 Base）

这个目录放的是本地 AI 抠图用的前景分割权重，随应用一起分发，用户不需要下载。

| 项 | 值 |
| --- | --- |
| 模型 ID | `ben2-base` |
| 文件 | `ben2-base-1.0.0.onnx` |
| 体积 | 222932053 字节（约 213MB） |
| sha256 | `22cea62108ff53b7ccc20f7a008bf30494228d84b1687f29ecbe76936a998101` |
| 运行方式 | ONNX Runtime，CPU 推理（不需要显卡、不需要 ComfyUI） |
| 来源 | Prama LLC 的 BEN2，官方 HuggingFace 仓库 `https://huggingface.co/PramaLLC/BEN2` 里的 `BEN2_Base.onnx`（sha256 与官方 LFS oid 完全一致，未做任何改动） |
| 论文 | BEN2: Background Erase Network, arXiv:2501.06230 |
| 许可 | MIT（HuggingFace 模型卡标注 `license:mit`，仓库非 gated） |

加载方式与官方 `onnx_run.py` 一致：输入缩放到 1024×1024、按 0–1 归一化、不加 sigmoid、输出做 min-max 拉伸到 0–255。两处差异：掩膜放大回原图用的是 lanczos3（官方用双线性 + Pillow resize），以及官方可选的 `refine_foreground` 精修步骤没有移植（那一步需要 PyTorch 权重 `BEN2_Base.pth`）。

服务端加载顺序：`AI_OS_BACKGROUND_REMOVAL_MODEL_PATH`（外部权重）→ `data/models/background-removal`（下载的更新 / 导入的权重）→ 本目录（内置权重）。

内置这一份是只读使用的，不会被复制到数据目录。在「设置 → 本地模型」里下载的更新会存到 `data/models/background-removal`，并优先于本目录的权重生效；点「恢复内置版本」就会删掉那份副本、回到这里的内置权重。只有它缺失或被改动时，工作台才会给出“导入本地模型”的兜底入口。改动这个文件前请确认 sha256 与上表一致，否则服务会拒绝加载。
