"""The random source of drills and reviews (card draws, toolkit options, interval fuzz).

`app.state.rng` is a `random.Random` seeded by the system; tests replace it with a
seeded one to fix the randomness.
"""

import random
from typing import Annotated

from fastapi import Depends, Request


def get_rng(request: Request) -> random.Random:
    rng: random.Random = request.app.state.rng
    return rng


Rng = Annotated[random.Random, Depends(get_rng)]
