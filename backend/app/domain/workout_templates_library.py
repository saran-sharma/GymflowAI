"""The default workout-template pack GymFlow ships with.

None of this is a prescription — each is a starting point a trainer applies to
a member (which copies it into that member's own ``MemberWorkoutProgram``) and
then edits freely. PPL is deliberately just one entry in this list rather than
the system's assumption; its exercises are pulled from
``app.domain.workout_library`` so the two stay in sync rather than duplicating
the same chart twice.

Each template is a plain, declarative description — name, category, and its
days (each with a name, category and exercise list) — consumed by
``app.services.workout_template_service.ensure_default_templates`` to create
(or update the content of) the system-owned rows. Nothing here is a SQLAlchemy
model; this is content, not schema.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain import workout_library as ppl

# (exercise, sets, reps, rest_seconds, notes)
ExerciseSpec = tuple[str, int, str, int, str | None]


@dataclass(frozen=True)
class TemplateDaySpec:
    name: str
    category: str  # WorkoutCategory value
    estimated_duration_minutes: int | None
    exercises: list[ExerciseSpec]


@dataclass(frozen=True)
class TemplateSpec:
    key: str  # stable identifier used to find-or-create the row, never shown
    name: str
    description: str
    category: str  # WorkoutCategory value
    image_key: str
    days: list[TemplateDaySpec]


def _ex(name: str, sets: int, reps: str, rest: int, notes: str | None = None) -> ExerciseSpec:
    return (name, sets, reps, rest, notes)


def _from_ppl(split: ppl.WorkoutSplit) -> list[ExerciseSpec]:
    return [_ex(name, sets, reps, rest) for name, sets, reps, rest in ppl.exercises_for(split)]


TEMPLATES: list[TemplateSpec] = [
    TemplateSpec(
        key="beginner_full_body_3day",
        name="Beginner Full Body",
        description="Three full-body sessions a week — the whole body, every time, so a new "
        "member never goes more than two days without training a muscle group.",
        category="full_body",
        image_key="full_body",
        days=[
            TemplateDaySpec(
                "Full Body A",
                "full_body",
                45,
                [
                    _ex("Goblet Squat", 3, "10-12", 60),
                    _ex("Machine Chest Press", 3, "10-12", 60),
                    _ex("Seated Cable Row", 3, "10-12", 60),
                    _ex("Glute Bridge", 3, "12-15", 45),
                    _ex("Plank", 3, "30 sec", 45),
                ],
            ),
            TemplateDaySpec(
                "Full Body B",
                "full_body",
                45,
                [
                    _ex("Leg Press", 3, "10-12", 75),
                    _ex("Dumbbell Shoulder Press", 3, "10-12", 60),
                    _ex("Lat Pulldown", 3, "10-12", 60),
                    _ex("Dumbbell Romanian Deadlift", 3, "10-12", 60),
                    _ex("Bicycle Crunch", 3, "15 each side", 30),
                ],
            ),
            TemplateDaySpec(
                "Full Body C",
                "full_body",
                45,
                [
                    _ex("Bodyweight Squat", 3, "15", 45),
                    _ex("Incline Push-Up", 3, "10-12", 45),
                    _ex("Cable Row", 3, "10-12", 60),
                    _ex("Step-Up", 3, "12 each side", 45),
                    _ex("Side Plank", 3, "20 sec each side", 45),
                ],
            ),
        ],
    ),
    TemplateSpec(
        key="general_fitness_3day",
        name="General Fitness",
        description="A balanced week for a member training for health rather than a "
        "specific sport — strength, cardio and core, spread across three sessions.",
        category="full_body",
        image_key="full_body",
        days=[
            TemplateDaySpec(
                "Full Body Strength",
                "full_body",
                50,
                [
                    _ex("Back Squat", 3, "8-10", 90),
                    _ex("Dumbbell Bench Press", 3, "10-12", 75),
                    _ex("Single-Arm Dumbbell Row", 3, "10-12", 75),
                    _ex("Standing Calf Raise", 3, "15-20", 45),
                ],
            ),
            TemplateDaySpec(
                "Cardio & Core",
                "conditioning",
                40,
                [
                    _ex("Treadmill — steady pace", 1, "20 min", 0),
                    _ex("Plank", 3, "30-45 sec", 45),
                    _ex("Bicycle Crunch", 3, "15 each side", 30),
                    _ex("Cycle — cool down", 1, "5 min", 0),
                ],
            ),
            TemplateDaySpec(
                "Full Body Conditioning",
                "full_body",
                45,
                [
                    _ex("Kettlebell Swing", 3, "15", 45),
                    _ex("Push-Up", 3, "12-15", 45),
                    _ex("Walking Lunge", 3, "12 each side", 60),
                    _ex("Cross Trainer", 1, "10 min", 0),
                ],
            ),
        ],
    ),
    TemplateSpec(
        key="upper_lower_4day",
        name="Upper / Lower",
        description="Four sessions a week, alternating upper and lower body so each gets "
        "trained twice — more frequency than a straight PPL split, at a lower "
        "session count.",
        category="upper",
        image_key="upper",
        days=[
            TemplateDaySpec(
                "Upper Strength",
                "upper",
                60,
                [
                    _ex("Barbell Bench Press", 4, "6-8", 120),
                    _ex("Barbell Row", 4, "6-8", 120),
                    _ex("Seated Shoulder Press", 3, "8-10", 90),
                    _ex("Lat Pulldown", 3, "10-12", 75),
                    _ex("Triceps Rope Pushdown", 3, "12-15", 45),
                ],
            ),
            TemplateDaySpec(
                "Lower Strength",
                "lower",
                60,
                [
                    _ex("Back Squat", 4, "6-8", 150),
                    _ex("Romanian Deadlift", 3, "8-10", 120),
                    _ex("Leg Press", 3, "10-12", 90),
                    _ex("Standing Calf Raise", 4, "12-15", 60),
                ],
            ),
            TemplateDaySpec(
                "Upper Hypertrophy",
                "upper",
                55,
                [
                    _ex("Incline Dumbbell Press", 3, "10-12", 75),
                    _ex("Seated Cable Row", 3, "10-12", 75),
                    _ex("Lateral Raise", 3, "12-15", 45),
                    _ex("Face Pull", 3, "12-15", 45),
                    _ex("Barbell Curl", 3, "10-12", 60),
                ],
            ),
            TemplateDaySpec(
                "Lower Hypertrophy",
                "lower",
                55,
                [
                    _ex("Leg Press", 3, "12-15", 75),
                    _ex("Walking Lunge", 3, "12 each side", 60),
                    _ex("Leg Curl", 3, "12-15", 45),
                    _ex("Leg Extension", 3, "12-15", 45),
                ],
            ),
        ],
    ),
    TemplateSpec(
        key="hypertrophy_4day",
        name="Hypertrophy",
        description="Higher volume, muscle-group-focused split for a member training to "
        "build size rather than chase a single lift.",
        category="push",
        image_key="push",
        days=[
            TemplateDaySpec(
                "Chest & Triceps",
                "push",
                55,
                [
                    _ex("Barbell Bench Press", 4, "8-10", 90),
                    _ex("Incline Dumbbell Press", 3, "10-12", 75),
                    _ex("Cable Chest Fly", 3, "12-15", 60),
                    _ex("Triceps Rope Pushdown", 4, "12-15", 45),
                ],
            ),
            TemplateDaySpec(
                "Back & Biceps",
                "pull",
                55,
                [
                    _ex("Lat Pulldown", 4, "10-12", 90),
                    _ex("Seated Cable Row", 3, "10-12", 75),
                    _ex("Single-Arm Dumbbell Row", 3, "10-12", 75),
                    _ex("Barbell Curl", 4, "10-12", 60),
                ],
            ),
            TemplateDaySpec(
                "Legs",
                "legs",
                60,
                [
                    _ex("Back Squat", 4, "8-10", 120),
                    _ex("Romanian Deadlift", 3, "10-12", 90),
                    _ex("Leg Press", 3, "12-15", 75),
                    _ex("Standing Calf Raise", 4, "15-20", 45),
                ],
            ),
            TemplateDaySpec(
                "Shoulders & Arms",
                "upper",
                50,
                [
                    _ex("Seated Shoulder Press", 4, "8-10", 90),
                    _ex("Lateral Raise", 4, "12-15", 45),
                    _ex("Hammer Curl", 3, "12-15", 45),
                    _ex("Triceps Rope Pushdown", 3, "12-15", 45),
                ],
            ),
        ],
    ),
    TemplateSpec(
        key="ppl_6day",
        name="Push / Pull / Legs",
        description="SLAM's original six-day chart — push, pull and legs, twice through "
        "the week. GymFlow's long-running default, now one template among "
        "several rather than the only option.",
        category="push",
        image_key="push",
        days=[
            TemplateDaySpec("Push A", "push", 60, _from_ppl(ppl.WorkoutSplit.PUSH)),
            TemplateDaySpec("Pull A", "pull", 60, _from_ppl(ppl.WorkoutSplit.PULL)),
            TemplateDaySpec("Legs A", "legs", 65, _from_ppl(ppl.WorkoutSplit.LEGS)),
            TemplateDaySpec("Push B", "push", 60, _from_ppl(ppl.WorkoutSplit.PUSH)),
            TemplateDaySpec("Pull B", "pull", 60, _from_ppl(ppl.WorkoutSplit.PULL)),
            TemplateDaySpec("Legs B", "legs", 65, _from_ppl(ppl.WorkoutSplit.LEGS)),
        ],
    ),
    TemplateSpec(
        key="strength_4day",
        name="Strength",
        description="Low reps, heavy sets, built around the big compound lifts for a "
        "member training for a number rather than a mirror.",
        category="lower",
        image_key="lower",
        days=[
            TemplateDaySpec(
                "Squat Day",
                "lower",
                60,
                [
                    _ex("Back Squat", 5, "5", 180),
                    _ex("Leg Press", 3, "8-10", 90),
                    _ex("Standing Calf Raise", 3, "10-12", 60),
                ],
            ),
            TemplateDaySpec(
                "Bench Day",
                "push",
                55,
                [
                    _ex("Barbell Bench Press", 5, "5", 180),
                    _ex("Incline Dumbbell Press", 3, "8-10", 90),
                    _ex("Triceps Rope Pushdown", 3, "10-12", 60),
                ],
            ),
            TemplateDaySpec(
                "Deadlift Day",
                "lower",
                60,
                [
                    _ex("Deadlift", 5, "5", 180),
                    _ex("Barbell Row", 3, "8-10", 90),
                    _ex("Face Pull", 3, "12-15", 45),
                ],
            ),
            TemplateDaySpec(
                "Overhead Press Day",
                "push",
                55,
                [
                    _ex("Seated Shoulder Press", 5, "5", 150),
                    _ex("Lat Pulldown", 3, "8-10", 90),
                    _ex("Barbell Curl", 3, "10-12", 60),
                ],
            ),
        ],
    ),
    TemplateSpec(
        key="full_body_3day",
        name="Full Body",
        description="Three full-body sessions for a member who trains a few days a week "
        "and wants every session to cover everything, at a more advanced load "
        "than the Beginner Full Body template.",
        category="full_body",
        image_key="full_body",
        days=[
            TemplateDaySpec(
                "Full Body A",
                "full_body",
                55,
                [
                    _ex("Back Squat", 4, "8-10", 90),
                    _ex("Barbell Bench Press", 3, "8-10", 90),
                    _ex("Barbell Row", 3, "8-10", 90),
                    _ex("Plank", 3, "45 sec", 45),
                ],
            ),
            TemplateDaySpec(
                "Full Body B",
                "full_body",
                55,
                [
                    _ex("Romanian Deadlift", 4, "8-10", 90),
                    _ex("Seated Shoulder Press", 3, "8-10", 90),
                    _ex("Lat Pulldown", 3, "10-12", 75),
                    _ex("Bicycle Crunch", 3, "15 each side", 30),
                ],
            ),
            TemplateDaySpec(
                "Full Body C",
                "full_body",
                55,
                [
                    _ex("Leg Press", 4, "10-12", 75),
                    _ex("Incline Dumbbell Press", 3, "10-12", 75),
                    _ex("Seated Cable Row", 3, "10-12", 75),
                    _ex("Side Plank", 3, "30 sec each side", 45),
                ],
            ),
        ],
    ),
    TemplateSpec(
        key="conditioning_hiit",
        name="Conditioning / HIIT",
        description="Interval and circuit work for a member training conditioning rather "
        "than strength — short, hard sessions built around work-to-rest "
        "intervals instead of sets-to-failure.",
        category="conditioning",
        image_key="conditioning",
        days=[
            TemplateDaySpec(
                "Intervals",
                "conditioning",
                30,
                [
                    _ex("Treadmill sprint intervals", 8, "30 sec on / 90 sec off", 0),
                    _ex("Cycle — cool down", 1, "5 min", 0),
                ],
            ),
            TemplateDaySpec(
                "Circuit",
                "conditioning",
                35,
                [
                    _ex("Kettlebell Swing", 4, "45 sec", 15),
                    _ex("Battle Ropes", 4, "30 sec", 15),
                    _ex("Box Step-Up", 4, "30 sec", 15),
                    _ex("Mountain Climbers", 4, "30 sec", 15),
                ],
            ),
            TemplateDaySpec(
                "Metcon",
                "conditioning",
                30,
                [
                    _ex("Rowing Machine", 5, "500m", 60),
                    _ex("Burpees", 5, "10", 60),
                ],
            ),
        ],
    ),
    TemplateSpec(
        key="mobility_recovery",
        name="Mobility / Recovery",
        description="Low-intensity movement and stretching for a member's rest days or an "
        "active-recovery week, rather than an off day with nothing on it.",
        category="mobility",
        image_key="mobility",
        days=[
            TemplateDaySpec(
                "Lower Body Mobility",
                "mobility",
                25,
                [
                    _ex("Hip Flexor Stretch", 3, "30 sec each side", 15, "Static stretch"),
                    _ex("90/90 Hip Switch", 3, "8 each side", 15),
                    _ex("Ankle Dorsiflexion Drill", 3, "10 each side", 15),
                    _ex("Foam Roll — legs", 1, "5 min", 0),
                ],
            ),
            TemplateDaySpec(
                "Upper Body Mobility",
                "mobility",
                25,
                [
                    _ex("Thoracic Rotation Stretch", 3, "8 each side", 15),
                    _ex("Band Pull-Apart", 3, "15", 15),
                    _ex("Shoulder Dislocate (band/PVC)", 3, "10", 15),
                    _ex("Foam Roll — upper back", 1, "5 min", 0),
                ],
            ),
            TemplateDaySpec(
                "Full Body Flow",
                "mobility",
                30,
                [
                    _ex("Cat-Cow", 1, "10", 0),
                    _ex("World's Greatest Stretch", 3, "5 each side", 15),
                    _ex("Bird Dog", 3, "8 each side", 15),
                    _ex("Light Walk", 1, "10 min", 0),
                ],
            ),
        ],
    ),
]


__all__ = ["TemplateDaySpec", "TemplateSpec", "TEMPLATES"]
