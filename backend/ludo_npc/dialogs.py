import os
import subprocess
import sys
from pathlib import Path
from threading import Lock

from .storage import FileProblem

_lock = Lock()


def open_folder(folder):
    path = Path(folder).resolve()
    if not path.is_dir():
        raise FileProblem("项目文件夹不存在，请检查是否已移动")
    try:
        if os.name == "nt":
            os.startfile(str(path))
        else:
            subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", str(path)])
    except OSError as exc:
        raise FileProblem("系统文件管理器暂不可用，请使用显示的项目路径") from exc


def choose_path(kind, initial_dir):
    """Only called by an explicit UI action. Tests replace this adapter."""
    with _lock:
        root = None
        try:
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            options = {"parent": root, "initialdir": initial_dir}
            if kind == "folder":
                return filedialog.askdirectory(title="选择 NPCs AI Studio 项目文件夹", **options) or None
            if kind == "open":
                return (
                    filedialog.askopenfilename(
                        title="打开 NPCs AI Studio 项目", filetypes=[("NPCs AI Studio 项目", "*.json")], **options
                    )
                    or None
                )
            return (
                filedialog.asksaveasfilename(
                    title="另存为 NPCs AI Studio 项目",
                    defaultextension=".ludo.json",
                    filetypes=[("NPCs AI Studio 项目", "*.ludo.json")],
                    confirmoverwrite=True,
                    **options,
                )
                or None
            )
        except Exception as exc:
            raise FileProblem(
                "系统文件选择器暂不可用，可以在窗口中填写完整路径", "dialog_unavailable"
            ) from exc
        finally:
            if root is not None:
                root.destroy()
