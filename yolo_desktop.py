"""
yolo_desktop.py - Standalone Desktop YOLO Camera Detector
Uses Ultralytics YOLOv8 and OpenCV to capture live camera feed and detect objects.

Setup & Run:
    pip install ultralytics opencv-python
    python yolo_desktop.py
"""

import cv2
import time
import sys

try:
    from ultralytics import YOLO
except ImportError:
    print("Error: 'ultralytics' is not installed.")
    print("Run: pip install ultralytics opencv-python")
    sys.exit(1)

# COCO Living Classes
LIVING_CLASSES = {
    'person', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
    'elephant', 'bear', 'zebra', 'giraffe', 'potted plant'
}

def run_yolo_camera(camera_index=0, model_name='yolov8n.pt'):
    print(f"Loading YOLO model: {model_name}...")
    model = YOLO(model_name)

    print(f"Opening camera stream index {camera_index}...")
    cap = cv2.VideoCapture(camera_index)

    if not cap.isOpened():
        print(f"Error: Could not open camera {camera_index}. Please check device permissions.")
        return

    # Set 720p resolution
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    print("\n--- YOLO LIVE CAMERA RUNNING ---")
    print("Press 'q' or 'ESC' in the camera window to exit.\n")

    prev_time = time.time()

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Failed to grab camera frame. Retrying...")
            time.sleep(0.1)
            continue

        curr_time = time.time()
        fps = 1.0 / (curr_time - prev_time) if curr_time > prev_time else 30
        prev_time = curr_time

        # Run YOLO inference
        results = model(frame, stream=True, verbose=False)

        living_count = 0
        non_living_count = 0

        for r in results:
            boxes = r.boxes
            for box in boxes:
                # Coordinates
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                name = model.names[cls_id]

                is_living = name.lower() in LIVING_CLASSES
                if is_living:
                    living_count += 1
                    color = (0, 255, 128) # Emerald Green (BGR)
                    badge = "LIVING"
                else:
                    non_living_count += 1
                    color = (255, 240, 0) # Cyan (BGR)
                    badge = "NON-LIVING"

                # Draw bounding box
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

                # Corner brackets
                bracket_len = min(20, (x2 - x1) // 4, (y2 - y1) // 4)
                cv2.line(frame, (x1, y1), (x1 + bracket_len, y1), color, 4)
                cv2.line(frame, (x1, y1), (x1, y1 + bracket_len), color, 4)
                cv2.line(frame, (x2, y1), (x2 - bracket_len, y1), color, 4)
                cv2.line(frame, (x2, y1), (x2, y1 + bracket_len), color, 4)
                cv2.line(frame, (x1, y2), (x1 + bracket_len, y2), color, 4)
                cv2.line(frame, (x1, y2), (x1, y2 - bracket_len), color, 4)
                cv2.line(frame, (x2, y2), (x2 - bracket_len, y2), color, 4)
                cv2.line(frame, (x2, y2), (x2, y2 - bracket_len), color, 4)

                # Label tag
                label = f"{name.upper()} {int(conf * 100)}% [{badge}]"
                label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                cv2.rectangle(frame, (x1, y1 - 22), (x1 + label_size[0] + 10, y1), (15, 20, 30), -1)
                cv2.putText(frame, label, (x1 + 5, y1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)

        # Header HUD overlay
        hud_bar = f"YOLOv8 // FPS: {int(fps)} | Living: {living_count} | Non-Living: {non_living_count}"
        cv2.rectangle(frame, (0, 0), (frame.shape[1], 40), (10, 15, 25), -1)
        cv2.putText(frame, hud_bar, (20, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 240, 255), 2, cv2.LINE_AA)

        cv2.imshow("AgentX Vision - YOLO Desktop Feed", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q') or key == 27:
            break

    cap.release()
    cv2.destroyAllWindows()
    print("YOLO camera session closed.")

if __name__ == '__main__':
    run_yolo_camera()
