"""
Ipsofarma - Webcam virtuale per Zoom
=====================================
Trasmette un video registrato in loop, oppure una foto fissa, come sorgente
di una webcam virtuale. Zoom (o qualsiasi altra app di videochiamata) puo'
selezionare questa telecamera al posto di quella fisica del PC.

Vedi README.md nella stessa cartella per le istruzioni di installazione e uso.
"""
import argparse
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import pyvirtualcam


def ask_source_via_dialog() -> Path:
    """Apre una finestra per scegliere il video o la foto da trasmettere.

    Usata quando lo script viene avviato con doppio click, senza argomenti
    da riga di comando (es. dall'eseguibile impacchettato con PyInstaller).
    """
    import tkinter as tk
    from tkinter import filedialog, messagebox

    root = tk.Tk()
    root.withdraw()
    messagebox.showinfo(
        "Webcam virtuale",
        "Seleziona nella prossima finestra il video o la foto da trasmettere come webcam.",
    )
    path_str = filedialog.askopenfilename(
        title="Scegli video o foto",
        filetypes=[
            ("Video e foto", "*.mp4 *.avi *.mov *.mkv *.jpg *.jpeg *.png *.bmp"),
            ("Tutti i file", "*.*"),
        ],
    )
    root.destroy()
    if not path_str:
        sys.exit("Nessun file selezionato. Uscita.")
    return Path(path_str)


def _to_rgb(frame: np.ndarray, width: int, height: int) -> np.ndarray:
    frame = cv2.resize(frame, (width, height))
    return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)


def run_photo(path: Path, width: int, height: int, fps: int) -> None:
    img = cv2.imread(str(path))
    if img is None:
        sys.exit(f"Impossibile leggere l'immagine: {path}")
    frame = _to_rgb(img, width, height)

    with pyvirtualcam.Camera(width=width, height=height, fps=fps) as cam:
        print(f"Webcam virtuale attiva ({cam.device}). Premi Ctrl+C per fermarla.")
        print("In Zoom: Impostazioni > Video > seleziona questa telecamera.")
        while True:
            cam.send(frame)
            cam.sleep_until_next_frame()


def run_video(path: Path, width: int, height: int, fps: int) -> None:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        sys.exit(f"Impossibile aprire il video: {path}")

    with pyvirtualcam.Camera(width=width, height=height, fps=fps) as cam:
        print(f"Webcam virtuale attiva ({cam.device}). Premi Ctrl+C per fermarla.")
        print("In Zoom: Impostazioni > Video > seleziona questa telecamera.")
        while True:
            ok, frame = cap.read()
            if not ok:
                # fine del video: riparte dall'inizio (loop continuo)
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue
            cam.send(_to_rgb(frame, width, height))
            cam.sleep_until_next_frame()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Trasmette un video registrato o una foto come webcam virtuale."
    )
    parser.add_argument(
        "source", type=Path, nargs="?", default=None,
        help="Percorso del video (.mp4/.avi) o della foto (.jpg/.png). "
             "Se omesso, si apre una finestra per sceglierlo.",
    )
    parser.add_argument("--width", type=int, default=1280, help="Larghezza output (default 1280)")
    parser.add_argument("--height", type=int, default=720, help="Altezza output (default 720)")
    parser.add_argument("--fps", type=int, default=30, help="Frame al secondo (default 30)")
    args = parser.parse_args()

    source = args.source if args.source is not None else ask_source_via_dialog()

    if not source.exists():
        sys.exit(f"File non trovato: {source}")

    is_photo = source.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp"}
    try:
        if is_photo:
            run_photo(source, args.width, args.height, args.fps)
        else:
            run_video(source, args.width, args.height, args.fps)
    except KeyboardInterrupt:
        print("\nWebcam virtuale interrotta.")


if __name__ == "__main__":
    main()
