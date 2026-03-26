import type { Meta, StoryObj } from "@storybook/react-vite";
import { TokenMap } from "./TokenMap";
import type { ColorMapping } from "../../shared/types";

const meta: Meta<typeof TokenMap> = {
  component: TokenMap,
  title: "Components/TokenMap",
};
export default meta;
type Story = StoryObj<typeof TokenMap>;

const mixedMappings: ColorMapping[] = [
  { hex: "#E20074", tokenName: "color-brand", count: 5, nodeId: "10:1" },
  { hex: "#1A1A1A", tokenName: "color-bg-primary", count: 12, nodeId: "10:2" },
  { hex: "#FFFFFF", tokenName: "color-text-inverse", count: 8, nodeId: "10:3" },
  { hex: "#FF5533", tokenName: null, count: 3, nodeId: "10:4" },
  { hex: "#333333", tokenName: "color-bg-secondary", count: 4, nodeId: "10:5" },
  { hex: "#AABBCC", tokenName: null, count: 1, nodeId: "10:6" },
  { hex: "#00CC88", tokenName: "color-success", count: 2, nodeId: "10:7" },
  { hex: "#FF0000", tokenName: null, count: 1, nodeId: "10:8" },
];

const allMapped: ColorMapping[] = [
  { hex: "#E20074", tokenName: "color-brand", count: 5, nodeId: "10:1" },
  { hex: "#1A1A1A", tokenName: "color-bg-primary", count: 12, nodeId: "10:2" },
  { hex: "#FFFFFF", tokenName: "color-text-inverse", count: 8, nodeId: "10:3" },
];

export const MixedWithProfile: Story = {
  args: {
    mappings: mixedMappings,
    profileName: "Superbrand DS",
  },
};

export const AllMapped: Story = {
  args: {
    mappings: allMapped,
    profileName: "Superbrand DS",
  },
};

export const WithoutProfile: Story = {
  args: {
    mappings: mixedMappings,
  },
};

export const Empty: Story = {
  args: {
    mappings: [],
  },
};
