"""
Sample Python module for testing language-aware chunking.
"""

from typing import List, Optional, TypeVar, Generic
from dataclasses import dataclass
from abc import ABC, abstractmethod


T = TypeVar('T')


@dataclass
class Person:
    """Represents a person with name and age."""
    name: str
    age: int
    email: Optional[str] = None

    def greet(self) -> str:
        """Return a greeting message."""
        return f"Hello, my name is {self.name}"

    def is_adult(self) -> bool:
        """Check if the person is an adult (18+)."""
        return self.age >= 18


class Stack(Generic[T]):
    """A generic stack implementation using a list."""

    def __init__(self) -> None:
        """Initialize an empty stack."""
        self._items: List[T] = []

    def push(self, item: T) -> None:
        """Push an item onto the stack."""
        self._items.append(item)

    def pop(self) -> T:
        """Remove and return the top item from the stack."""
        if self.is_empty():
            raise IndexError("Cannot pop from empty stack")
        return self._items.pop()

    def peek(self) -> T:
        """Return the top item without removing it."""
        if self.is_empty():
            raise IndexError("Cannot peek empty stack")
        return self._items[-1]

    def is_empty(self) -> bool:
        """Check if the stack is empty."""
        return len(self._items) == 0

    def size(self) -> int:
        """Return the number of items in the stack."""
        return len(self._items)


class Shape(ABC):
    """Abstract base class for geometric shapes."""

    @abstractmethod
    def area(self) -> float:
        """Calculate the area of the shape."""
        pass

    @abstractmethod
    def perimeter(self) -> float:
        """Calculate the perimeter of the shape."""
        pass


class Rectangle(Shape):
    """A rectangle shape with width and height."""

    def __init__(self, width: float, height: float) -> None:
        """Initialize a rectangle with given dimensions."""
        self.width = width
        self.height = height

    def area(self) -> float:
        """Calculate the area of the rectangle."""
        return self.width * self.height

    def perimeter(self) -> float:
        """Calculate the perimeter of the rectangle."""
        return 2 * (self.width + self.height)


class Circle(Shape):
    """A circle shape with a radius."""

    PI = 3.14159265359

    def __init__(self, radius: float) -> None:
        """Initialize a circle with given radius."""
        self.radius = radius

    def area(self) -> float:
        """Calculate the area of the circle."""
        return self.PI * self.radius ** 2

    def perimeter(self) -> float:
        """Calculate the circumference of the circle."""
        return 2 * self.PI * self.radius


def calculate_statistics(numbers: List[float]) -> dict:
    """
    Calculate basic statistics for a list of numbers.

    Args:
        numbers: A list of numeric values

    Returns:
        A dictionary containing mean, min, max, and sum
    """
    if not numbers:
        return {"mean": 0, "min": 0, "max": 0, "sum": 0}

    total = sum(numbers)
    return {
        "mean": total / len(numbers),
        "min": min(numbers),
        "max": max(numbers),
        "sum": total,
    }
