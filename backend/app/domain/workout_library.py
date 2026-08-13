"""SLAM's default PPL chart.

This is a starting template, not a prescription: a trainer with permission
edits a member's plan, and their edits are stored per member so changing the
template later never rewrites somebody's programme mid-journey.
"""

from __future__ import annotations

from app.db.models import WorkoutSplit

# (exercise, sets, reps, rest seconds)
Exercise = tuple[str, int, str, int]

PUSH: list[Exercise] = [
    ("Barbell Bench Press", 4, "8-10", 90),
    ("Incline Dumbbell Press", 3, "10-12", 75),
    ("Seated Shoulder Press", 3, "10-12", 75),
    ("Cable Chest Fly", 3, "12-15", 60),
    ("Lateral Raise", 3, "12-15", 45),
    ("Triceps Rope Pushdown", 3, "12-15", 45),
]

PULL: list[Exercise] = [
    ("Lat Pulldown", 4, "10-12", 90),
    ("Seated Cable Row", 3, "10-12", 75),
    ("Single-Arm Dumbbell Row", 3, "10-12", 75),
    ("Face Pull", 3, "12-15", 45),
    ("Barbell Curl", 3, "10-12", 60),
    ("Hammer Curl", 3, "12-15", 45),
]

LEGS: list[Exercise] = [
    ("Back Squat", 4, "8-10", 120),
    ("Romanian Deadlift", 3, "10-12", 90),
    ("Leg Press", 3, "12-15", 75),
    ("Walking Lunge", 3, "12 each", 60),
    ("Leg Curl", 3, "12-15", 45),
    ("Standing Calf Raise", 4, "15-20", 45),
]

CARDIO: list[Exercise] = [
    ("Treadmill — steady pace", 1, "15 min", 0),
    ("Cross Trainer", 1, "10 min", 0),
    ("Cycle — cool down", 1, "5 min", 0),
]

ASSESSMENT: list[Exercise] = [
    ("Movement screen with trainer", 1, "—", 0),
    ("Baseline strength check", 1, "—", 0),
    ("Goal setting", 1, "—", 0),
]

BY_SPLIT: dict[WorkoutSplit, list[Exercise]] = {
    WorkoutSplit.PUSH: PUSH,
    WorkoutSplit.PULL: PULL,
    WorkoutSplit.LEGS: LEGS,
    WorkoutSplit.CARDIO: CARDIO,
    WorkoutSplit.ASSESSMENT: ASSESSMENT,
    WorkoutSplit.REST: [],
}

SPLIT_LABELS: dict[WorkoutSplit, str] = {
    WorkoutSplit.PUSH: "Push",
    WorkoutSplit.PULL: "Pull",
    WorkoutSplit.LEGS: "Legs",
    WorkoutSplit.CARDIO: "Cardio",
    WorkoutSplit.ASSESSMENT: "Assessment",
    WorkoutSplit.REST: "Rest",
}


def exercises_for(split: WorkoutSplit) -> list[Exercise]:
    return list(BY_SPLIT.get(split, []))


__all__ = ["BY_SPLIT", "SPLIT_LABELS", "Exercise", "exercises_for"]
