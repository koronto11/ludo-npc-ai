"""Portable, safe names and a self-contained project-folder layout."""

import re


def directory_name(name):
    value = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "-", name).strip(" .")[:90].rstrip(" .")
    value = value or "未命名项目"
    if reserved(value):
        value += "-项目"
    return value


def reserved(name):
    return bool(re.fullmatch(r"CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]", name.split(".")[0], re.I))
