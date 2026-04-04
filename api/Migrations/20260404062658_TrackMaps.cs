using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ValHelpApi.Migrations
{
    /// <inheritdoc />
    public partial class TrackMaps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "track_maps",
                columns: table => new
                {
                    seed = table.Column<string>(type: "text", nullable: false),
                    map_tex = table.Column<byte[]>(type: "bytea", nullable: false),
                    height_tex = table.Column<byte[]>(type: "bytea", nullable: false),
                    mask_tex = table.Column<byte[]>(type: "bytea", nullable: false),
                    uploaded_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    uploaded_by = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_track_maps", x => x.seed);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "track_maps");
        }
    }
}
